import 'dotenv/config';
import { connectDatabase } from './database.js';
import { seedIfEmpty } from './seed.js';
import { createApp } from './app.js';
import { createERPWorker } from './erp.js';

const port = Number(process.env.PORT || 3000);
const server = createApp();
let listener, closeDatabase, interval;
let stopping = false;

async function cleanup() {
  if (interval) clearInterval(interval);
  if (listener?.listening) await new Promise(resolve => listener.close(resolve));
  if (closeDatabase) await closeDatabase();
}

async function stop() {
  if (stopping) return;
  stopping = true;
  await cleanup();
  process.exit(0);
}

try {
  // Reserve the app port BEFORE launching MongoDB to prevent a second
  // mongod from trying to use the same persistent data folder.
  await new Promise((resolve, reject) => {
    listener = server.listen(port, '127.0.0.1');
    listener.once('listening', resolve);
    listener.once('error', reject);
  });
  closeDatabase = await connectDatabase();
  await seedIfEmpty();
  const tick = createERPWorker(process.env.ERP_URL || `http://127.0.0.1:${port}/mock-erp`);
  interval = setInterval(() => tick().catch(error => console.error('ERP worker:', error.message)), 1000);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`Application ready: http://localhost:${port}`);
} catch (error) {
  await cleanup();
  if (error.code === 'EADDRINUSE') {
    let existing;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
      existing = await response.json();
    } catch { /* Another service may own this port. */ }
    if (existing?.application === 'distributor-orders') {
      console.log(`The app is already running at http://localhost:${port}. Open that address. To restart, press Ctrl+C in the original terminal first.`);
      process.exitCode = 0;
    } else {
      console.error(`Port ${port} is already in use. If this app is open, use http://localhost:${port}. Otherwise stop the process using that port or choose a different PORT in .env. MongoDB was not started.`);
      process.exitCode = 1;
    }
  } else {
    console.error(`Startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
