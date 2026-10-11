import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

export async function enqueueNotification({ recipientUserId, type, title, message, entityType = null, entityId = null, eventKey = randomUUID() }, conn = pool) {
  await conn.execute(
    `INSERT INTO notification_outbox_events
      (event_key, recipient_user_id, notification_type, title, message, related_entity_type, related_entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE event_key = VALUES(event_key)`,
    [eventKey, recipientUserId, type, title, message, entityType, entityId]
  );
}
