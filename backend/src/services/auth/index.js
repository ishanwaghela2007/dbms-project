import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { pool } from '../../shared/db.js';
import { safeDelete } from '../../shared/redis.js';
import { config } from '../../config/env.js';
import { erpProto, startGrpcService } from '../../shared/grpc.js';
import { badRequest, forbidden, notFound } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { sendForgotPasswordMail, sendInvitationMail, sendVerificationMail } from '../../shared/mailer.js';

function publicUser(row) {
  return { id: row.id, email: row.email, fullName: row.full_name, accountType: row.account_type, is_admin: Boolean(row.is_admin), is_active: Boolean(row.is_active), mustSetPassword: Boolean(row.must_set_password), avatar_public_id: row.avatar_public_id || undefined };
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
    if (!user.is_active) {
      const [verRows] = await pool.execute('SELECT id FROM email_verifications WHERE user_id=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() LIMIT 1', [user.id]);
      if (verRows[0]) {
        const error = new Error('Please verify your email before logging in. Check your inbox for the activation link.');
        error.grpcCode = 7;
        error.publicMessage = 'Please verify your email before logging in. Check your inbox for the activation link.';
        throw error;
      }
      const error = new Error('Account is inactive'); error.grpcCode = 7; error.publicMessage = 'Account is inactive'; throw error;
    }
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
      const mailRes = await sendInvitationMail({ to: normalizedEmail, fullName: String(fullName).trim(), inviteUrl, role: accountType }).catch(err => ({ success: false, error: err.message }));
      if (mailRes?.success) logger.info({ to: normalizedEmail }, 'Dispatched account invitation email');
      else logger.warn({ to: normalizedEmail, err: mailRes?.error }, 'Invitation email failed to send');
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
  async register({ fullName, email, password, accountType = 'STUDENT', departmentId, programId, enrollmentNo, employeeId, autoActivate = true, actorUserId }) {
    if (actorUserId) {
      const [actors] = await pool.execute('SELECT is_admin, is_active FROM users WHERE id=? LIMIT 1', [actorUserId]);
      if (!actors[0] || !actors[0].is_active || !actors[0].is_admin) throw forbidden('Only an active administrator can register accounts');
    }
    if (!email || !password || !fullName) throw badRequest('Full name, email and password are required');
    if (typeof password !== 'string' || password.length < 8) throw badRequest('Password must be at least 8 characters');
    const normalizedEmail = String(email).trim().toLowerCase();
    const type = ['STUDENT', 'TEACHER'].includes(String(accountType).toUpperCase()) ? String(accountType).toUpperCase() : 'STUDENT';

    // Check if user already exists
    const [existing] = await pool.execute('SELECT id, is_active FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    if (existing[0]) {
      if (!existing[0].is_active) {
        return handlers.resendVerification({ email: normalizedEmail });
      }
      throw badRequest('An account with this email address already exists. Please sign in instead.');
    }

    const id = randomUUID();
    const hash = await bcrypt.hash(String(password), 12);
    const activeVal = autoActivate !== false ? 1 : 0;
    await pool.execute(
      'INSERT INTO users (id, email, password_hash, full_name, account_type, is_admin, is_active, must_set_password) VALUES (?, ?, ?, ?, ?, 0, ?, 0)',
      [id, normalizedEmail, hash, String(fullName).trim(), type, activeVal]
    );

    if (type === 'STUDENT') {
      try {
        const roll = enrollmentNo || `STU-${Date.now().toString().slice(-6)}`;
        let dept = departmentId;
        let prog = programId;
        if (!dept || !prog) {
          const [dRows] = await pool.execute('SELECT id FROM departments LIMIT 1');
          dept = dept || dRows[0]?.id;
          const [pRows] = await pool.execute('SELECT id FROM programs WHERE department_id=? LIMIT 1', [dept || '']);
          prog = prog || pRows[0]?.id;
        }
        if (dept && prog) {
          await pool.execute(
            `INSERT INTO student_profiles (user_id, enrollment_no, department_id, program_id, admission_year, current_year, current_semester, division) VALUES (?, ?, ?, ?, ?, 1, 1, 'A')`,
            [id, roll, dept, prog, new Date().getFullYear()]
          );
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not create initial student profile during self-registration');
      }
    } else if (type === 'TEACHER') {
      try {
        const emp = employeeId || `FAC-${Date.now().toString().slice(-6)}`;
        let dept = departmentId;
        if (!dept) {
          const [dRows] = await pool.execute('SELECT id FROM departments LIMIT 1');
          dept = dRows[0]?.id;
        }
        if (dept) {
          await pool.execute(
            `INSERT INTO faculty_profiles (user_id, employee_id, department_id, designation) VALUES (?, ?, ?, 'Lecturer')`,
            [id, emp, dept]
          );
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not create initial faculty profile during self-registration');
      }
    }

    // Generate verification token
    const verificationToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(verificationToken).digest('hex');
    await pool.execute(
      'INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))',
      [randomUUID(), id, tokenHash]
    );

    const front = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${front}/verify-email?token=${verificationToken}`;

    const mailResult = await sendVerificationMail({
      to: normalizedEmail,
      fullName: String(fullName).trim(),
      verifyUrl
    });
    if (!mailResult.success) {
      logger.warn({ to: normalizedEmail, err: mailResult.error }, 'Failed to send verification email');
    } else {
      logger.info({ to: normalizedEmail }, 'Dispatched verification email successfully');
    }

    return {
      success: true,
      message: activeVal === 1
        ? `Account for ${String(fullName).trim()} created and activated successfully.`
        : 'Registration successful! We have sent an email verification link to your email address.',
      email: normalizedEmail,
      isActive: activeVal === 1,
      ...(process.env.NODE_ENV === 'production' ? {} : { verificationToken, verifyUrl })
    };
  },
  async verifyEmail({ token }) {
    if (!token) throw badRequest('Verification token is required');
    const tokenHash = createHash('sha256').update(String(token).trim()).digest('hex');
    const [rows] = await pool.execute(
      `SELECT v.id verification_id, v.user_id, u.email, u.full_name, u.account_type, u.is_active
       FROM email_verifications v
       JOIN users u ON u.id = v.user_id
       WHERE v.token_hash = ? AND v.used_at IS NULL AND v.expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [tokenHash]
    );
    const verification = rows[0];
    if (!verification) {
      throw badRequest('Invalid, expired, or already-used verification link. Please request a new verification email.');
    }

    await pool.execute('UPDATE users SET is_active = 1 WHERE id = ?', [verification.user_id]);
    await pool.execute('UPDATE email_verifications SET used_at = UTC_TIMESTAMP() WHERE id = ?', [verification.verification_id]);
    await safeDelete(`authz:${verification.user_id}`);

    logger.info({ email: verification.email }, 'User email verified and account activated');

    return {
      success: true,
      email: verification.email,
      fullName: verification.full_name,
      accountType: verification.account_type,
      message: 'Your email address has been verified successfully. You can now sign in to your account.'
    };
  },
  async resendVerification({ email }) {
    if (!email) throw badRequest('Email address is required');
    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await pool.execute('SELECT id, full_name, is_active FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    const user = rows[0];
    if (!user) {
      return { success: true, message: 'If that email is registered and pending activation, a new verification link has been sent.' };
    }
    if (user.is_active) {
      return { success: true, message: 'Your account is already active. You can sign in directly.', alreadyActive: true };
    }

    // Invalidate earlier unused verification tokens
    await pool.execute('UPDATE email_verifications SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [user.id]);

    const verificationToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(verificationToken).digest('hex');
    await pool.execute(
      'INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR))',
      [randomUUID(), user.id, tokenHash]
    );

    const front = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
    const verifyUrl = `${front}/verify-email?token=${verificationToken}`;

    const mailResult = await sendVerificationMail({
      to: normalizedEmail,
      fullName: user.full_name,
      verifyUrl
    });
    if (!mailResult.success) {
      logger.warn({ to: normalizedEmail, err: mailResult.error }, 'Failed to resend verification email');
    }

    return {
      success: true,
      message: 'A fresh verification link has been dispatched to your email.',
      email: normalizedEmail,
      ...(process.env.NODE_ENV === 'production' ? {} : { verificationToken, verifyUrl })
    };
  },
};

startGrpcService({ name: 'auth-service', address: process.env.AUTH_GRPC_ADDR || '127.0.0.1:50051', Service: erpProto.AuthService, handlers });

// Bootstrap via `npm run db:seed-admin`; services do not silently grant admin rights at startup.
logger.info('Auth service initialized');
