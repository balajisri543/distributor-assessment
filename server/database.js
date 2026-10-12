import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { models } from './models.js';

export async function connectDatabase({ temporary = false } = {}) {
  let localMongo;
  let uri = temporary ? '' : process.env.MONGO_URL;
  if (temporary || !uri || process.env.MONGO_MODE === 'local') {
    if (!temporary && await isPortOpen(27018)) {
      throw new Error('Local MongoDB port 27018 is already in use. Stop the earlier app terminal with Ctrl+C before restarting. Your saved data has not been changed.');
    }
    const dataPath = path.resolve('.data/mongo');
    if (!temporary) await mkdir(dataPath, { recursive: true });
    console.log(temporary ? 'Starting test database…' : 'Starting local MongoDB (first run downloads MongoDB)…');
    localMongo = await MongoMemoryReplSet.create({
      binary: { version: '7.0.24' },
      instanceOpts: temporary ? [] : [{ dbPath: dataPath, port: 27018 }],
      replSet: { count: 1, storageEngine: 'wiredTiger', name: 'assessment-rs' }
    });
    // Tests always use an isolated database. The app uses the URL from .env.
    uri = temporary ? localMongo.getUri('assessment_tests') : (uri || localMongo.getUri('distributor_assessment'));
  }
  try {
    await mongoose.connect(uri);
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!topology.setName && topology.msg !== 'isdbgrid') {
      throw new Error('MONGO_URL points to standalone MongoDB, which cannot run order transactions. Use MONGO_MODE=local with the supplied local replica-set URL, or MONGO_MODE=external with a replica-set/Atlas connection string. The connected database was not seeded or modified.');
    }
    // Initialize collections only AFTER checking transaction support.
    for (const model of models) {
      await model.createCollection();
      await model.createIndexes();
    }
  } catch (error) {
    await mongoose.disconnect();
    if (localMongo) await localMongo.stop({ doCleanup: temporary });
    throw error;
  }
  return async () => {
    await mongoose.disconnect();
    if (localMongo) await localMongo.stop({ doCleanup: temporary });
  };
}

async function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    function finish(open) {
      if (settled) return;
      settled = true; socket.destroy(); resolve(open);
    }
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}
