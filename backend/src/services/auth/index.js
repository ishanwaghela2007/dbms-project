import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pool } from '../../shared/db.js';
import { safeDelete } from '../../shared/redis.js';
import { config } from '../../config/env.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { sendForgotPasswordMail, sendInvitationMail } from '../../shared/mailer.js';

function publicUser(row) {
  return { id: row.id, email: row.email, fullName: row.full_name, accountType: row.account_type, is_admin: Boolean(row.is_admin), is_active: Boolean(row.is_active), mustSetPassword: Boolean(row.must_set_password) };
}

const handlers = {
  async login({ email, password }) {
    if (!email || !password) throw badRequest('Email and password are required');
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? LIMIT 1', [String(email).trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      const error = new Error('Invalid email or password'); error.grpcCode = 16; error.publicMessage = 'Invalid email or password'; throw error;
    }
    if (user.must_set_password) { const error = new Error('Account setup required. Use the invitation link to set a password.'); error.grpcCode = 7; error.publicMessage = 'Account setup required. Use the invitation link to set a password.'; throw error; }
    if (!user.is_active) { const error = new Error('Account is inactive'); error.grpcCode = 7; error.publicMessage = 'Account is inactive'; throw error; }
    const accessToken = jwt.sign({ sub: user.id }, config.jwtSecret, { issuer: config.jwtIssuer, audience: config.jwtAudience, expiresIn: config.jwtAccessTtl });
    return { accessToken, tokenType: 'Bearer', expiresIn: config.jwtAccessTtl, user: publicUser(user) };
  },
  async getAuthorization({ userId }) {
    if (!userId) throw badRequest('userId is required');
    const [rows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,must_set_password FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows[0]) return { found: false, is_admin: false, is_active: false };
    const u = publicUser(rows[0]);
    return { found: true, ...u, accountType: u.accountType };
  },
  async getUser({ userId }) {
    const [rows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,created_at FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!rows[0]) throw notFound('User not found');
    return publicUser(rows[0]);
  },
  async createUser({ actorUserId, email, password, fullName, accountType = 'STUDENT', isAdmin = false }) {
    const [actors] = await pool.execute('SELECT is_admin,is_active FROM users WHERE id=? LIMIT 1', [actorUserId || '']);
    if (!actors[0] || !actors[0].is_active || !actors[0].is_admin) throw forbidden('Only an active administrator can create accounts');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || (password && String(password).length < 12) || !fullName) throw badRequest('Full name and valid email are required; passwords must be at least 12 characters when supplied');
    if (!['ADMIN','TEACHER','STUDENT'].includes(accountType)) throw badRequest('Invalid accountType');
    if (accountType !== 'ADMIN' && isAdmin) throw badRequest('Only ADMIN accounts may have is_admin=true');
    if (accountType === 'ADMIN' && isAdmin !== true) throw badRequest('ADMIN accounts must be explicitly provisioned with is_admin=true');
    const id = randomUUID();
    const mustSetPassword = !password;
    if (mustSetPassword && process.env.NODE_ENV === 'production' && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) {
      throw badRequest('Production account provisioning requires an invitation email provider configuration');
    }
    const inviteToken = mustSetPassword ? randomBytes(32).toString('base64url') : null;
    const passwordToHash = password || randomBytes(48).toString('base64url');
    const hash = await bcrypt.hash(String(passwordToHash), 12);
    await pool.execute('INSERT INTO users (id,email,password_hash,full_name,account_type,is_admin,must_set_password) VALUES (?,?,?,?,?,?,?)', [id, normalizedEmail, hash, String(fullName).trim(), accountType, accountType === 'ADMIN' && Boolean(isAdmin), mustSetPassword]);
    if (inviteToken) {
      await pool.execute('INSERT INTO user_invitations (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR))', [randomUUID(), id, createHash('sha256').update(inviteToken).digest('hex')]);
      const front = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
      const inviteUrl = `${front}/accept-invitation?token=${inviteToken}`;
      await sendInvitationMail({ to: normalizedEmail, fullName: String(fullName).trim(), inviteUrl, role: accountType }).catch(() => {});
      if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
        try {
          const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{'Authorization':`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'}, body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[normalizedEmail],subject:'Set up your College ERP account',html:`<p>Hello ${String(fullName).replace(/[<>]/g,'')},</p><p><a href="${inviteUrl}">Set your College ERP password</a>. This link expires in 24 hours.</p>`}) });
          if (!response.ok) logger.error({status:response.status},'Invitation email provider returned an error');
        } catch (error) { logger.error({err:error.message},'Could not send account invitation email'); }
      }
      return { id, email: normalizedEmail, fullName: String(fullName).trim(), accountType, is_admin: accountType === 'ADMIN' && Boolean(isAdmin), is_active: true, mustSetPassword: true, ...(process.env.NODE_ENV === 'production' ? {} : { inviteToken, inviteUrl }) };
    }
    return { id, email: normalizedEmail, fullName: String(fullName).trim(), accountType, is_admin: accountType === 'ADMIN' && Boolean(isAdmin), is_active: true, mustSetPassword: false };
  },
  async acceptInvitation({ token, password }) {
    if (!token || typeof password !== 'string' || password.length < 12) throw badRequest('Invitation token and a password of at least 12 characters are required');
    const tokenHash=createHash('sha256').update(String(token)).digest('hex');
    const [rows]=await pool.execute(`SELECT i.id invitation_id,i.user_id,u.email FROM user_invitations i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>UTC_TIMESTAMP() AND u.is_active=1 AND u.must_set_password=1 LIMIT 1`,[tokenHash]);
    const invitation=rows[0]; if(!invitation) throw badRequest('Invitation is invalid, expired, or already used');
    const hash=await bcrypt.hash(password,12);
    await pool.execute('UPDATE users SET password_hash=?,must_set_password=0 WHERE id=?',[hash,invitation.user_id]);
    await pool.execute('UPDATE user_invitations SET used_at=UTC_TIMESTAMP() WHERE id=?',[invitation.invitation_id]);
    await safeDelete(`authz:${invitation.user_id}`);
    return {success:true,email:invitation.email,message:'Password set. You can now sign in.'};
  },
  async updateUserStatus({ actorUserId, userId, isActive, isAdmin }) {
    const [actors] = await pool.execute('SELECT is_admin,is_active FROM users WHERE id=? LIMIT 1', [actorUserId || '']);
    if (!actors[0] || !actors[0].is_active || !actors[0].is_admin) throw forbidden('Only an active administrator can change account permissions');
    const sets = []; const params = [];
    if (typeof isActive === 'boolean') { sets.push('is_active = ?'); params.push(isActive); }
    if (typeof isAdmin === 'boolean') { sets.push('is_admin = ?'); params.push(isAdmin); }
    if (!sets.length) throw badRequest('Provide isActive or isAdmin');
    if (typeof isAdmin === 'boolean' || isActive === false) {
      const [check] = await pool.execute('SELECT account_type,is_admin,is_active FROM users WHERE id = ?', [userId]);
      if (!check[0]) throw notFound('User not found');
      if (check[0].account_type !== 'ADMIN' && isAdmin === true) throw badRequest('Set accountType=ADMIN before granting admin access');
      const willLoseAdmin = Boolean(check[0].is_admin) && (isAdmin === false || isActive === false);
      if (willLoseAdmin) {
        const [activeAdmins] = await pool.execute('SELECT COUNT(*) AS total FROM users WHERE is_admin=1 AND is_active=1');
        if (Number(activeAdmins[0].total) <= 1) throw badRequest('Cannot deactivate or demote the last active administrator');
      }
    }
    params.push(userId);
    const [result] = await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    if (!result.affectedRows) throw notFound('User not found');
    await safeDelete(`authz:${userId}`);
    const [rows] = await pool.execute('SELECT id,email,full_name,account_type,is_admin,is_active,must_set_password FROM users WHERE id = ?', [userId]);
    return publicUser(rows[0]);
  },
  async forgotPassword({ email }) {
    if (!email) throw badRequest('Email address is required');
    const normalized = String(email).trim().toLowerCase();
    const [rows] = await pool.execute('SELECT id,email,full_name,is_active FROM users WHERE email=? LIMIT 1', [normalized]);
    const user = rows[0];
    if (user && user.is_active) {
      const resetToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(resetToken).digest('hex');
      const resetId = randomUUID();
      await pool.execute(
        'INSERT INTO password_resets (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))',
        [resetId, user.id, tokenHash]
      );
      const front = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
      const resetUrl = `${front}/reset-password?token=${resetToken}`;
      await sendForgotPasswordMail({ to: user.email, fullName: user.full_name, resetUrl }).catch(() => {});
      logger.info({ email: user.email }, 'Password reset link generated and dispatched');
      return { ok: true, message: 'Password reset link has been dispatched to your email.', resetToken, resetUrl };
    }
    return { ok: true, message: 'If that email is registered, a password reset link has been dispatched.' };
  },
  async resetPassword({ token, password }) {
    if (!token || typeof password !== 'string' || password.length < 8) {
      throw badRequest('Valid reset token and new password (min 8 characters) are required');
    }
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');
    const [rows] = await pool.execute(
      'SELECT r.id reset_id, r.user_id, u.email FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at > UTC_TIMESTAMP() AND u.is_active=1 LIMIT 1',
      [tokenHash]
    );
    const reset = rows[0];
    if (!reset) throw badRequest('Reset link is invalid, expired, or has already been used');
    const hash = await bcrypt.hash(password, 12);
    await pool.execute('UPDATE users SET password_hash=?, must_set_password=0 WHERE id=?', [hash, reset.user_id]);
    await pool.execute('UPDATE password_resets SET used_at=UTC_TIMESTAMP() WHERE id=?', [reset.reset_id]);
    await safeDelete(`authz:${reset.user_id}`);
    logger.info({ userId: reset.user_id }, 'Password reset successfully completed');
    return { ok: true, message: 'Password successfully updated. You may now log in.' };
  },
  async changePassword({ actorUserId, currentPassword, newPassword }) {
    if (!actorUserId || !currentPassword || !newPassword) throw badRequest('Current password and new password are required');
    if (newPassword.length < 8) throw badRequest('New password must have at least 8 characters');
    const [rows] = await pool.execute('SELECT id,password_hash FROM users WHERE id=? AND is_active=1 LIMIT 1', [actorUserId]);
    const user = rows[0];
    if (!user) throw notFound('User not found');
    const match = await bcrypt.compare(String(currentPassword), user.password_hash);
    if (!match) throw badRequest('Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash=? WHERE id=?', [hash, actorUserId]);
    await safeDelete(`authz:${actorUserId}`);
    return { ok: true, message: 'Password changed successfully.' };
  },
};

startGrpcService({ name: 'auth-service', address: process.env.AUTH_GRPC_ADDR || '127.0.0.1:50051', Service: erpProto.AuthService, handlers });

// Bootstrap via `npm run db:seed-admin`; services do not silently grant admin rights at startup.
logger.info('Auth service initialized');
