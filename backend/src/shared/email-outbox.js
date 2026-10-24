import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

/** Queue email for the notification worker. Never send mail on an API request. */
export async function enqueueEmail({ eventKey = randomUUID(), to, kind, payload }) {
  if (!to || !kind || !payload) throw new Error('Email recipient, kind, and payload are required');
  await pool.execute(
    `INSERT INTO email_outbox_events (event_key,recipient_email,email_kind,payload_json)
     VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)`,
    [eventKey, String(to).trim().toLowerCase(), kind, JSON.stringify(payload)]
  );
  return { eventKey, status: 'PENDING' };
}
