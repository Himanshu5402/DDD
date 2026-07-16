import nodemailer from 'nodemailer';
import env from '../../config/env.js';
import logger from '../../config/logger.js';

/**
 * Mail service. When SMTP_* is configured it sends via Nodemailer; otherwise
 * (typical in local dev) it logs the message to the console so flows that send
 * mail — invites, password resets, notifications — still work without SMTP.
 */
let transporter = null;

function getTransport() {
  if (transporter !== null) return transporter;
  if (!env.SMTP_HOST) {
    transporter = false; // sentinel: "no transport configured"
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * @param {{ to: string|string[], subject: string, html?: string, text?: string }} msg
 */
export async function sendMail(msg) {
  const transport = getTransport();
  const payload = { from: env.MAIL_FROM, ...msg };

  if (!transport) {
    logger.info(
      `[mail:dev] To: ${payload.to} | Subject: ${payload.subject}\n${payload.text || stripHtml(payload.html)}`
    );
    return { delivered: false, dev: true };
  }

  const info = await transport.sendMail(payload);
  logger.info(`Mail sent: ${info.messageId} → ${payload.to}`);
  return { delivered: true, messageId: info.messageId };
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
