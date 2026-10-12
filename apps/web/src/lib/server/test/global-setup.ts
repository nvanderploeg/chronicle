import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';

export default async function setup(): Promise<void> {
	const uri = process.env.DATABASE_URL;
	if (!uri) throw new Error('DATABASE_URL is not set');

	const connection = await mysql.createConnection({ uri });
	try {
		await connection.query("SET time_zone = '+00:00'");
		await migrate(drizzle(connection), {
			migrationsFolder: resolve(import.meta.dirname, '../../../../drizzle')
		});
	} finally {
		await connection.end();
	}
}
