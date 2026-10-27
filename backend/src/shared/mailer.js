import nodemailer from 'nodemailer';
import { logger } from './logger.js';

let transporter = null;
export const recentEmails = [];

async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    logger.info({ host, port, user, secure }, 'Nodemailer configured with external SMTP');
  } else {
    // Development fallback: stream transport that logs full emails + stores in recentEmails
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
    logger.info('Nodemailer initialized in local development mode (emails logged to terminal)');
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  try {
    const rawFrom = process.env.SMTP_FROM || (process.env.SMTP_USER ? `"CampusFlow ERP" <${process.env.SMTP_USER}>` : '"CampusFlow ERP" <no-reply@college.edu>');
    const from = String(rawFrom).replace(/^['"]|['"]$/g, '').trim();

    const transport = await getTransporter();
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]+>/g, ''),
      html,
    });

    const emailRecord = {
      id: info.messageId || `mail-${Date.now()}`,
      to,
      subject,
      sentAt: new Date().toISOString(),
      preview: text ? text.slice(0, 150) : '',
    };
    recentEmails.unshift(emailRecord);
    if (recentEmails.length > 50) recentEmails.pop();

    logger.info({ to, subject }, `[MAILER SENT] to: ${to} | subject: "${subject}"`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error({ err: error.message, to, subject }, 'Failed to send email via nodemailer');
    return { success: false, error: error.message };
  }
}

export async function sendForgotPasswordMail({ to, fullName, resetUrl }) {
  const subject = 'CampusFlow ERP - Password Reset Request';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #1e1b4b; margin: 0; font-size: 22px;">CampusFlow ERP</h2>
        <span style="color: #6366f1; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Security Notice</span>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${fullName || 'Campus Member'}</strong>,</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        We received a request to reset your password for your institutional account (<code>${to}</code>).
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
          Reset My Password
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        Or copy and paste this link in your browser:<br/>
        <a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a>
      </p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px;">
        This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email; your password remains unchanged.
      </p>
    </div>
  `;
  return sendMail({ to, subject, html });
}

export async function sendVerificationMail({ to, fullName, verifyUrl }) {
  const subject = 'CampusFlow ERP - Verify Your Email Address';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #1e1b4b; margin: 0; font-size: 22px;">CampusFlow ERP</h2>
        <span style="color: #6366f1; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Email Verification</span>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${fullName || 'Campus Member'}</strong>,</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Thank you for registering on CampusFlow ERP. Please verify your email address (<code>${to}</code>) to activate your account and access your academic workspace.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
          Verify Email & Activate Account
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        Or copy and paste this link in your browser:<br/>
        <a href="${verifyUrl}" style="color: #4f46e5; word-break: break-all;">${verifyUrl}</a>
      </p>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 14px;">
        This verification link will expire in <strong>24 hours</strong>. If you did not create an account on CampusFlow ERP, you can safely ignore this email.
      </p>
    </div>
  `;
  return sendMail({ to, subject, html });
}

export async function sendInvitationMail({ to, fullName, inviteUrl, role }) {
  const subject = 'CampusFlow ERP - Set Up Your Account';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="color: #1e1b4b; margin: 0; font-size: 22px;">CampusFlow ERP</h2>
        <span style="color: #6366f1; font-size: 12px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Welcome to CampusFlow</span>
      </div>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${fullName}</strong>,</p>
      <p style="color: #334155; font-size: 15px; line-height: 1.6;">
        Your official ${role || 'campus'} account has been provisioned on the College ERP system. Please set up your password to begin using your portal.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background-color: #10b981; color: #ffffff; padding: 12px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block;">
          Activate Account & Set Password
        </a>
      </div>
      <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
        This activation link is valid for <strong>24 hours</strong>.
      </p>
    </div>
  `;
  return sendMail({ to, subject, html });
}

export async function sendNotificationMail({ to, fullName, title, message, kind = 'GENERAL' }) {
  const badgeColor = kind === 'ATTENDANCE' ? '#ef4444' : kind === 'MEETING' ? '#3b82f6' : kind === 'RESULT' ? '#10b981' : '#6366f1';
  const subject = `[Notification] ${title} - CampusFlow ERP`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 20px;">
        <h3 style="color: #1e1b4b; margin: 0;">CampusFlow ERP Notification</h3>
        <span style="background-color: ${badgeColor}; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; text-transform: uppercase;">${kind}</span>
      </div>
      <p style="color: #334155; font-size: 15px;">Hello <strong>${fullName || 'Campus Member'}</strong>,</p>
      <div style="background-color: #f8fafc; border-left: 4px solid ${badgeColor}; padding: 14px 18px; border-radius: 4px; margin: 16px 0;">
        <h4 style="margin: 0 0 6px 0; color: #0f172a; font-size: 16px;">${title}</h4>
        <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">${message}</p>
      </div>
      <p style="color: #64748b; font-size: 13px; margin-top: 20px;">
        Log in to your campus portal at <a href="${process.env.FRONTEND_BASE_URL || 'http://localhost:3000'}" style="color: #4f46e5;">CampusFlow ERP</a> to respond or view more details.
      </p>
    </div>
  `;
  return sendMail({ to, subject, html });
}
