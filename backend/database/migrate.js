import 'dotenv/config';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';

const connection = await mysql.createConnection({
  host: config.mysqlHost,
  port: config.mysqlPort,
  user: config.mysqlUser,
  password: config.mysqlPassword,
  multipleStatements: true,
  timezone: 'Z'
});
try {
  const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await connection.query(schema);
  // CREATE TABLE IF NOT EXISTS does not add columns to databases created by older releases.
  const additions = [
    ['input_pdf', 'LONGBLOB NULL'],
    ['entered_rows_json', 'JSON NULL'],
    ['attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['worker_locked_at', 'TIMESTAMP NULL'],
    ['completed_at', 'TIMESTAMP NULL'],
  ];
  for (const [column, definition] of additions) {
    const [rows] = await connection.query(`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='college_erp' AND TABLE_NAME='mark_validation_jobs' AND COLUMN_NAME=?`, [column]);
    if (!rows.length) await connection.query(`ALTER TABLE mark_validation_jobs ADD COLUMN ${column} ${definition}`);
  }
  const [authVersion] = await connection.query(`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='college_erp' AND TABLE_NAME='users' AND COLUMN_NAME='auth_version'`);
  if (!authVersion.length) await connection.query('ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1');
  const triggers = await fs.readFile(new URL('./triggers.sql', import.meta.url), 'utf8');
  // DELIMITER is a CLI command, so apply each complete trigger statement separately.
  const body = triggers.replace(/DELIMITER\s+\$\$/g, '').replace(/DELIMITER\s+;/g, '').replace(/^\s*USE\s+college_erp\s*;/i, '');
  const statements = body.split('$$').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await connection.query(statement);
  console.log(`Migration complete: schema applied and ${statements.length} trigger statements installed.`);
} finally { await connection.end(); }
