import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDatabase({ dbName } = {}) {
  if (!config.mongoUri) throw new Error('Falta MONGODB_URI en el archivo .env');
  await mongoose.connect(config.mongoUri, dbName ? { dbName } : {});
  await mongoose.syncIndexes();
  return mongoose.connection;
}
