import 'dotenv/config';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';

/**
 * Utility script: Ensures only the administrative account is kept in the database,
 * removing any leftover sample/dummy accounts (students, teachers, enrollments, assignments).
 */
const db = await mysql.createConnection(
  config.mysqlUrl
    ? { uri: config.mysqlUrl, ssl: config.mysqlSsl }
    : {
        host: config.mysqlHost,
        port: config.mysqlPort,
        user: config.mysqlUser,
        password: config.mysqlPassword,
        database: config.mysqlDatabase,
        ssl: config.mysqlSsl,
      }
);

try {
  await db.query('SET FOREIGN_KEY_CHECKS = 0;');
  await db.execute('DELETE FROM enrollments WHERE student_user_id IN (SELECT id FROM users WHERE is_admin = 0)');
  await db.execute('DELETE FROM teaching_assignments WHERE teacher_user_id IN (SELECT id FROM users WHERE is_admin = 0)');
  await db.execute('DELETE FROM student_profiles WHERE user_id IN (SELECT id FROM users WHERE is_admin = 0)');
  await db.execute('DELETE FROM faculty_profiles WHERE user_id IN (SELECT id FROM users WHERE is_admin = 0)');
  const [result] = await db.execute('DELETE FROM users WHERE is_admin = 0');
  await db.query('SET FOREIGN_KEY_CHECKS = 1;');

  const [remaining] = await db.execute('SELECT id, email, full_name, account_type, is_admin FROM users');
  console.log(`Cleaned non-admin accounts. Removed ${result.affectedRows} users.`);
  console.log('Active users remaining:', remaining);
} finally {
  await db.end();
}
