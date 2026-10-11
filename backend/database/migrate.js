import 'dotenv/config';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'erp_user',
  password: process.env.MYSQL_PASSWORD || 'change_me',
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
