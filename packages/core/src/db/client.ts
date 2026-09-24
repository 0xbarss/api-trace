import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const DEFAULT_DATABASE_URL = "postgres://apitrace_user:apitrace_password@localhost:5432/apitrace_db";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
