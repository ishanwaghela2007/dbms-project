import 'dotenv/config';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';

const targetDb = config.mysqlDatabase || 'college_erp';

const connection = await mysql.createConnection(
  config.mysqlUrl
    ? {
        uri: config.mysqlUrl,
        ssl: config.mysqlSsl,
        multipleStatements: true,
        timezone: 'Z',
      }
    : {
        host: config.mysqlHost,
        port: config.mysqlPort,
        user: config.mysqlUser,
        password: config.mysqlPassword,
        ssl: config.mysqlSsl,
        multipleStatements: true,
        timezone: 'Z',
      }
);

try {
  const schema = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await connection.query(schema);

  // Column additions for schema evolution
  const additions = [
    ['input_pdf', 'LONGBLOB NULL'],
    ['entered_rows_json', 'JSON NULL'],
    ['attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['worker_locked_at', 'TIMESTAMP NULL'],
    ['completed_at', 'TIMESTAMP NULL'],
  ];
  for (const [column, definition] of additions) {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='mark_validation_jobs' AND COLUMN_NAME=?`,
      [targetDb, column]
    );
    if (!rows.length) {
      await connection.query(`ALTER TABLE mark_validation_jobs ADD COLUMN ${column} ${definition}`);
    }
  }

  const [authVersion] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='auth_version'`,
    [targetDb]
  );
  if (!authVersion.length) {
    await connection.query('ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1');
  }

  const [avatarCol] = await connection.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='users' AND COLUMN_NAME='avatar_public_id'`,
    [targetDb]
  );
  if (!avatarCol.length) {
    await connection.query('ALTER TABLE users ADD COLUMN avatar_public_id VARCHAR(255) NULL');
  }

  // Check database engine version for TiDB Cloud compatibility
  const [versionRows] = await connection.query('SELECT VERSION() AS ver');
  const serverVersion = String(versionRows[0]?.ver || '');
  const isTiDB = /tidb/i.test(serverVersion) || config.mysqlPort === 4000 || process.env.SKIP_TRIGGERS === 'true';

  // TiDB Cloud does not support triggers. Standard MySQL uses application-level audit logs.
  // Drop legacy triggers if present to prevent double-auditing since application services write audit rows directly.
  if (isTiDB) {
    console.log(`[TiDB Cloud Compatibility] TiDB detected (${serverVersion || 'port 4000'}). Triggers skipped; application-level validation & auditing are fully active.`);
  } else {
    const legacyTriggers = [
      'trg_marks_before_insert', 'trg_marks_before_update',
      'trg_marks_after_insert', 'trg_marks_after_update', 'trg_marks_after_delete',
      'trg_appointment_status_audit', 'trg_user_security_audit', 'trg_user_security_insert'
    ];
    for (const trg of legacyTriggers) {
      try { await connection.query(`DROP TRIGGER IF EXISTS ${trg}`); } catch {}
    }
    console.log('Application-level audit logging and validation active; legacy duplicate triggers dropped.');
  }

  console.log('Migration complete: schemas and constraints applied successfully.');
} finally {
  await connection.end();
}
