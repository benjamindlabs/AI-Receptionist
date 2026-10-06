import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

const databaseUrl = process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL environment variable is required but not set. ' +
      'Add it to your .env.local file.',
  );
}

/**
 * Raw postgres.js client.
 * Exported for cases that need direct access (e.g. drizzle-kit config).
 */
const client = postgres(databaseUrl);

/**
 * Drizzle ORM instance with full schema.
 * Use this for all database operations throughout the application.
 */
export const db = drizzle(client, { schema });

export type DB = typeof db;
export type DBExecutor = DB | Parameters<Parameters<DB['transaction']>[0]>[0];
