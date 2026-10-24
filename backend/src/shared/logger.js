import pino from 'pino';

// L-1 fix: redact all fields that could contain credentials or PII in any log record.
// L-2 fix: 'user' (SMTP user) is redacted so the startup log never leaks email addresses.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'password_hash',
      'pdfBase64',
      'token',
      'resetToken',
      'inviteToken',
      'verificationToken',
      'resetUrl',
      'inviteUrl',
      'verifyUrl',
      'pass',      // SMTP_PASS surface
      'user',      // SMTP_USER surface (startup log)
      'apiSecret',
      'CLOUDINARY_API_SECRET',
    ],
    censor: '[REDACTED]',
  },
});
