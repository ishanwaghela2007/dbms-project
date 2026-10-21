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
  const triggers = await fs.readFile(new URL('./triggers.sql', import.meta.url), 'utf8');
  // DELIMITER is a CLI command, so apply each complete trigger statement separately.
  const body = triggers.replace(/DELIMITER\s+\$\$/g, '').replace(/DELIMITER\s+;/g, '').replace(/^\s*USE\s+college_erp\s*;/i, '');
  const statements = body.split('$$').map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await connection.query(statement);
  console.log(`Migration complete: schema applied and ${statements.length} trigger statements installed.`);
} finally { await connection.end(); }
