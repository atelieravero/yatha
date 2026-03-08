import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// This URL comes from your .env file
const connectionString = process.env.DATABASE_URL!;

// Initialize the Postgres client
const client = postgres(connectionString, { prepare: false });

// Export the 'db' object. We will import this into any file that needs to read/write data!
export const db = drizzle(client, { schema });