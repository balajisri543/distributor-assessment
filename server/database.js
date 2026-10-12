import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { models } from './models.js';

export async function connectDatabase({ temporary = false } = {}) {
  let localMongo;
  let uri = temporary ? '' : process.env.MONGO_URL;
  if (!uri) {
    const dataPath = path.resolve('.data/mongo');
    if (!temporary) await mkdir(dataPath, { recursive: true });
    console.log(temporary ? 'Starting test database…' : 'Starting local MongoDB (first run downloads MongoDB)…');
    localMongo = await MongoMemoryReplSet.create({
      binary: { version: '7.0.24' },
      instanceOpts: temporary ? [] : [{ dbPath: dataPath, port: 27018 }],
      replSet: { count: 1, storageEngine: 'wiredTiger', name: 'assessment-rs' }
    });
    uri = localMongo.getUri(temporary ? 'assessment_tests' : 'distributor_assessment');
  }
  await mongoose.connect(uri);
  for (const model of models) await model.init();
  return async () => {
    await mongoose.disconnect();
    if (localMongo) await localMongo.stop({ doCleanup: temporary });
  };
}
