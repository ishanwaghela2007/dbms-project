import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';

const email=process.env.ADMIN_EMAIL;
const password=process.env.ADMIN_PASSWORD;
const fullName=process.env.ADMIN_NAME||'College Administrator';
if(!email||!password||password==='CHANGE_THIS_TO_A_LONG_UNIQUE_PASSWORD'||password.length<12) throw new Error('Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters in .env before seeding');
const db=await mysql.createConnection(config.mysqlUrl ? { uri: config.mysqlUrl, ssl: config.mysqlSsl } : { host: config.mysqlHost, port: config.mysqlPort, user: config.mysqlUser, password: config.mysqlPassword, database: config.mysqlDatabase, ssl: config.mysqlSsl });
try {
 const normalized=email.trim().toLowerCase(); const [rows]=await db.execute('SELECT id FROM users WHERE email=?',[normalized]);
 if(rows[0]) { console.log(`Admin already exists: ${normalized}; no changes made.`); process.exitCode=0; }
 else { const hash=await bcrypt.hash(password,12); await db.execute(`INSERT INTO users (id,email,password_hash,full_name,account_type,is_admin,is_active,must_set_password) VALUES (?,?,?,?,'ADMIN',1,1,0)`,[randomUUID(),normalized,hash,fullName]); console.log(`Created initial administrator ${normalized}`); }
} finally { await db.end(); }
