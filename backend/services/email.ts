// services/email.js
import nodemailer from 'nodemailer';
import type { NotificationWithRelations } from '../controllers/app/notification.js';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

let transporter: nodemailer.Transporter | null = null;

// Инициализация транспортера
function initialize() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('Email credentials not configured');
    return;
  }
  try {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    } as SMTPTransport.Options);
  } catch (error) {
    console.error('Failed to initialize email transporter:', error);
    transporter = null;
  }
}

// Генерация текста письма
function generatePlainText(notification: NotificationWithRelations): string {
  const senderName = notification.sender?.name ?? 'Система';
  const senderEmailLine = notification.sender?.email ? `Email: ${notification.sender.email}` : '';
  const toolLine = notification.tool?.name ? `Сервис: ${notification.tool.name}` : '';
  return `
    ${notification.message}
    
    Отправитель: ${senderName}
    ${senderEmailLine}
    ${toolLine}
  `.trim();
}

// Утилиты для безопасной разметки
function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, '&#96;');
}

function nl2br(input: string): string {
  return escapeHtml(input).replace(/\r?\n/g, '<br/>');
}

// Генерация HTML письма (адаптивный, компактный шаблон)
function generateHtml(notification: NotificationWithRelations): string {
  const brand = 'DNS Hub';
  const toolName = notification.tool?.name ?? brand;
  const title = escapeHtml(notification.title);
  const message = nl2br(notification.message);
  const senderName = notification.sender?.name ?? 'Система';
  const senderEmail = notification.sender?.email ? ` &lt;${escapeHtml(notification.sender.email)}&gt;` : '';
  const createdAt = notification.createdAt ? new Date(notification.createdAt).toLocaleString('ru-RU') : '';
  const action: any = notification.action || {};
  const actionUrl: string | undefined = action?.url || action?.href;
  const actionText: string = action?.text || 'Открыть в системе';

  const cta = actionUrl
    ? `<tr><td align="center" style="padding: 24px 0 0 0;">
          <a href="${escapeAttr(actionUrl)}" target="_blank" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#f9b17a;color:#25292b;text-decoration:none;font-weight:700">${escapeHtml(actionText)}</a>
        </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body{margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827}
    .container{max-width:640px;margin:0 auto;padding:24px}
    .card{background:#ffffff;border-radius:12px;border:1px solid #e5e7eb}
    .header{background:#25292b;color:#ffffff;border-radius:12px 12px 0 0;padding:20px}  
    .title{margin:4px 0 0 0;font-size:18px;line-height:1.4;font-weight:700}
    .sub{margin:0;font-size:13px;color:#9ca3af}
    .content{padding:20px}
    .footer{padding:16px 20px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;border-rad  ius:0 0 12px 12px}
  </style>
  <!--[if mso]>
  <style>
    .title{font-size:20px !important}
    </style>
    <![endif]-->
</head>
<body>
    <div class="container">
      <table class="card" role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td class="header">
            <div style="font-size:12px;color:#9ca3af">${escapeHtml(toolName)}</div>
            <div class="title">${title}</div>
                                                    </td>
                                                </tr>
                                                <tr>
          <td class="content">
            <div style="font-size:14px;line-height:1.6">${message}</div>
            ${cta}
                                                                                    </td>
                                                                                </tr>
                                                                                <tr>
          <td class="footer">
            Отправитель: ${escapeHtml(senderName)}${senderEmail}${createdAt ? ` · ${escapeHtml(createdAt)}` : ''}<br/>
            ${toolName !== brand ? `${escapeHtml(brand)} · Автоматическое уведомление` : 'Автоматическое уведомление'}
                    </td>
                </tr>
        </table>
    </div>
</body>
</html>`;
}

// Простой HTML-шаблон для sendRaw
function generateBasicHtml(subject: string, message: string, subtitle?: string): string {
  const safeSubject = escapeHtml(subject);
  const safeMessage = nl2br(message);
  const sub = subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : '';
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${safeSubject}</title>
  <style>body{margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827}.container{max-width:640px;margin:0 auto;padding:24px}.card{background:#ffffff;border-radius:12px;border:1px solid #e5e7eb}.header{background:#25292b;color:#ffffff;border-radius:12px 12px 0 0;padding:20px}.title{margin:0;font-size:18px;font-weight:700}.sub{margin:4px 0 0 0;font-size:13px;color:#9ca3af}.content{padding:20px}</style></head>
  <body><div class="container"><table class="card" role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td class="header"><div class="title">${safeSubject}</div>${sub}</td></tr><tr><td class="content"><div style="font-size:14px;line-height:1.6">${safeMessage}</div></td></tr></table></div></body></html>`;
}

// Отправка уведомления
async function send(notification: NotificationWithRelations): Promise<boolean> {
  if (!transporter || !notification.receiver?.email) {
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"${notification.sender?.name ?? 'DNS Hub'}" <${process.env.EMAIL_USER}>`,
      to: notification.receiver.email,
      subject: notification.title,
      text: generatePlainText(notification),
      html: generateHtml(notification),
    });
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// Инициализируем при загрузке модуля
initialize();

// Экспортируем API сервиса
export const emailService = {
  send,
  isConfigured: () => !!transporter,
  sendRaw: async (toEmail: string, subject: string, message: string, senderName?: string): Promise<boolean> => {
    if (!transporter || !toEmail) return false;
    try {
      await transporter.sendMail({
        from: `"${senderName ?? 'DNS Hub'}" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject,
        text: message,
        html: generateBasicHtml(subject, message, 'Почтовое уведомление')
      });
      return true;
    } catch (error) {
      console.error('Failed to send raw email:', error);
      return false;
    }
  }
};