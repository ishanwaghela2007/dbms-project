import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

export const pool = mysql.createPool({
  host: config.mysqlHost,
  port: config.mysqlPort,
  user: config.mysqlUser,
  password: config.mysqlPassword,
  database: config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: config.mysqlConnectionLimit,
  queueLimit: 0,
  timezone: 'Z',
  decimalNumbers: true,
  namedPlaceholders: true,
  multipleStatements: false,
});

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function pingDb() {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    return rows[0]?.ok === 1;
  } catch {
    // Return false instead of throwing — callers must never receive a stack trace from a health probe.
    return false;
  }
}
