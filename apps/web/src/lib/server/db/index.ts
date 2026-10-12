import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema.ts';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const pool = mysql.createPool({ uri: DATABASE_URL, connectionLimit: 10 });

// Pin sessions to UTC so CURRENT_TIMESTAMP defaults agree with the UTC values drizzle writes.
pool.pool.on('connection', (connection) => {
	connection.query("SET time_zone = '+00:00'");
});

export const db = drizzle(pool, { schema, mode: 'default' });
