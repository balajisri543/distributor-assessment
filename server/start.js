import 'dotenv/config';
import { connectDatabase } from './database.js';
import { seedIfEmpty } from './seed.js';
import { createApp } from './app.js';
import { createERPWorker } from './erp.js';

const closeDatabase = await connectDatabase();
try { await seedIfEmpty(); }
catch (error) { await closeDatabase(); throw error; }
const port = Number(process.env.PORT || 3000);
const server = createApp().listen(port, '127.0.0.1', () => console.log(`Application ready: http://localhost:${port}`));
const tick = createERPWorker(process.env.ERP_URL || `http://127.0.0.1:${port}/mock-erp`);
const interval = setInterval(() => tick().catch(error => console.error('ERP worker:', error.message)), 1000);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(interval);
  await new Promise(resolve => server.close(resolve));
  await closeDatabase();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
