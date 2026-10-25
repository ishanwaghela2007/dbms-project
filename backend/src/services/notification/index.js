import { randomUUID } from 'node:crypto';
import { pool } from '../../shared/db.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { forbidden, notFound, badRequest } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { sendForgotPasswordMail, sendInvitationMail, sendNotificationMail, sendVerificationMail } from '../../shared/mailer.js';

async function actor(id) { const [r]=await pool.execute('SELECT id,account_type,is_admin,is_active FROM users WHERE id=?',[id]); return r[0]; }
async function deliverBatch() {
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [events]=await conn.query(`SELECT * FROM notification_outbox_events WHERE status='PENDING' ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`);
    for(const e of events) {
      await conn.execute(`INSERT INTO student_notifications (id,recipient_user_id,event_key,notification_type,title,message,related_entity_type,related_entity_id) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)`,[randomUUID(),e.recipient_user_id,e.event_key,e.notification_type,e.title,e.message,e.related_entity_type,e.related_entity_id]);
      await conn.execute(`UPDATE notification_outbox_events SET status='DELIVERED',attempts=attempts+1,delivered_at=UTC_TIMESTAMP(),last_error=NULL WHERE id=?`,[e.id]);

      // Persist the email independently; notification delivery must not wait for SMTP.
      const [uRows] = await conn.execute('SELECT email, full_name FROM users WHERE id=? LIMIT 1', [e.recipient_user_id]);
      if (uRows[0]?.email) {
        await conn.execute(`INSERT INTO email_outbox_events (event_key,recipient_email,email_kind,payload_json)
          VALUES (?,?, 'NOTIFICATION', ?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)`,
          [`notification:${e.event_key}`,uRows[0].email,JSON.stringify({fullName:uRows[0].full_name,title:e.title,message:e.message,kind:e.notification_type})]);
      }
    }
    await conn.commit();
  } catch(err) {
    await conn.rollback(); logger.error({err:err.message},'Notification outbox delivery batch failed');
    try { await pool.execute(`UPDATE notification_outbox_events SET attempts=attempts+1,last_error=? WHERE status='PENDING' AND attempts<10`,[String(err.message).slice(0,500)]); } catch {}
  } finally { conn.release(); }
}
async function deliverEmailBatch() {
  const conn = await pool.getConnection();
  let events = [];
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(`SELECT * FROM email_outbox_events WHERE (status='PENDING' OR (status='PROCESSING' AND worker_locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))) AND available_at <= UTC_TIMESTAMP() ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED`);
    events = rows || [];
    for (const event of events) {
      await conn.execute(`UPDATE email_outbox_events SET status='PROCESSING', attempts=attempts+1, worker_locked_at=UTC_TIMESTAMP() WHERE id=?`, [event.id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    logger.warn({ err: err.message }, 'Failed to lock email outbox batch');
    return;
  } finally {
    conn.release();
  }

  for (const event of events) {
    try {
      const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : (event.payload_json || {});
      let result;
      if (event.email_kind === 'PASSWORD_RESET') result = await sendForgotPasswordMail({ to: event.recipient_email, ...payload });
      else if (event.email_kind === 'VERIFY_EMAIL') result = await sendVerificationMail({ to: event.recipient_email, ...payload });
      else if (event.email_kind === 'INVITATION') result = await sendInvitationMail({ to: event.recipient_email, ...payload });
      else result = await sendNotificationMail({ to: event.recipient_email, ...payload });

      if (result?.success) {
        await pool.execute(`UPDATE email_outbox_events SET status='DELIVERED', delivered_at=UTC_TIMESTAMP(), worker_locked_at=NULL, last_error=NULL WHERE id=?`, [event.id]);
      } else {
        const errorMsg = result?.error || 'Email provider rejected delivery';
        const retry = Number(event.attempts) < 5;
        const delaySeconds = retry ? Math.min(300, 2 ** Number(event.attempts)) : 0;
        await pool.execute(
          `UPDATE email_outbox_events SET status=?, available_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), worker_locked_at=NULL, last_error=? WHERE id=?`,
          [retry ? 'PENDING' : 'FAILED', delaySeconds, String(errorMsg).slice(0, 500), event.id]
        );
      }
    } catch (err) {
      const retry = Number(event.attempts) < 5;
      const delaySeconds = retry ? Math.min(300, 2 ** Number(event.attempts)) : 0;
      await pool.execute(
        `UPDATE email_outbox_events SET status=?, available_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), worker_locked_at=NULL, last_error=? WHERE id=?`,
        [retry ? 'PENDING' : 'FAILED', delaySeconds, String(err.message).slice(0, 500), event.id]
      ).catch(() => {});
    }
  }
}
const handlers={
  async listNotifications(input) {
    const u=await actor(input.actorUserId); if(!u?.is_active) throw forbidden('Active account required');
    const limit=Math.min(100,Math.max(1,Number(input.limit)||50));
    const [rows]=await pool.execute(`SELECT id,notification_type type,title,message,related_entity_type relatedEntityType,related_entity_id relatedEntityId,is_read isRead,created_at createdAt,read_at readAt FROM student_notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT ?`,[u.id,limit]);
    const [count]=await pool.execute('SELECT COUNT(*) unread FROM student_notifications WHERE recipient_user_id=? AND is_read=0',[u.id]);
    return {items:rows,unreadCount:Number(count[0].unread)};
  },
  async markNotificationRead(input) {
    const [r]=await pool.execute('UPDATE student_notifications SET is_read=1,read_at=UTC_TIMESTAMP() WHERE id=? AND recipient_user_id=?',[input.notificationId,input.actorUserId]);
    if(!r.affectedRows){const [exists]=await pool.execute('SELECT id FROM student_notifications WHERE id=?',[input.notificationId]);if(!exists[0]) throw notFound('Notification not found');throw forbidden('This notification belongs to another user');}
    return {id:input.notificationId,isRead:true};
  },
  async enqueueNotification(input) {
    const recipientUserId=input.recipientUserId; if(!recipientUserId||!input.title||!input.message) throw badRequest('recipientUserId, title and message are required');
    const eventKey=input.eventKey||randomUUID();
    await pool.execute(`INSERT INTO notification_outbox_events (event_key,recipient_user_id,notification_type,title,message,related_entity_type,related_entity_id) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE event_key=VALUES(event_key)`,[eventKey,recipientUserId,input.type||'GENERAL',input.title,input.message,input.entityType||null,input.entityId||null]);
    return {eventKey,status:'PENDING'};
  }
};
startGrpcService({name:'notification-service',serviceName:'notification',address:process.env.NOTIFICATION_GRPC_ADDR||'127.0.0.1:50057',Service:erpProto.NotificationService,handlers});
setInterval(()=>{deliverBatch().catch(err=>logger.error({err:err.message},'Outbox worker error'));},2000).unref();
deliverBatch().catch(err=>logger.warn({err:err.message},'Initial outbox poll failed; retrying on interval'));
setInterval(()=>{deliverEmailBatch().catch(err=>logger.error({err:err.message},'Email outbox worker error'));},2000).unref();
deliverEmailBatch().catch(err=>logger.warn({err:err.message},'Initial email outbox poll failed; retrying on interval'));
logger.info('Notification service initialized');
