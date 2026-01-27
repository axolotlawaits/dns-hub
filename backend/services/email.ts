// services/email.js
import nodemailer from 'nodemailer';
import type { NotificationWithRelations } from '../controllers/app/notification.js';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from '../server.js';

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

// Генерация HTML письма с учетом темы пользователя (дизайн портала)
function generateHtml(notification: NotificationWithRelations, isDark: boolean = false): string {
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

  // Цвета портала в зависимости от темы
  const colors = isDark ? {
    bg: '#082f49',           // primary-950 (фон страницы)
    card: '#1e293b',         // gray-800 (карточка)
    text: '#f1f5f9',         // gray-100 (основной текст)
    textSecondary: '#cbd5e1', // gray-300 (вторичный текст)
    textTertiary: '#94a3b8',  // gray-400 (третичный текст)
    border: '#334155',        // gray-700 (границы)
    headerGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', // primary-500 to primary-600
    buttonBg: '#0ea5e9',     // primary-500
    buttonHover: '#0284c7',   // primary-600
  } : {
    bg: '#f8fafc',           // gray-50 (фон страницы)
    card: '#ffffff',         // white (карточка)
    text: '#0f172a',         // gray-900 (основной текст)
    textSecondary: '#475569', // gray-600 (вторичный текст)
    textTertiary: '#64748b',  // gray-500 (третичный текст)
    border: '#e2e8f0',        // gray-200 (границы)
    headerGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)', // primary-500 to primary-600
    buttonBg: '#0ea5e9',     // primary-500
    buttonHover: '#0284c7',   // primary-600
  };

  // Получаем URL фронтенда для правильных ссылок
  const hubFrontendUrl = process.env.HUB_FRONTEND_URL || process.env.HUB_API_URL?.replace('/hub-api', '') || 'http://localhost:5173';
  
  // Исправляем actionUrl если он относительный
  let finalActionUrl = actionUrl;
  if (actionUrl && !actionUrl.startsWith('http://') && !actionUrl.startsWith('https://')) {
    // Если URL начинается с /, добавляем базовый URL фронтенда
    if (actionUrl.startsWith('/')) {
      finalActionUrl = `${hubFrontendUrl}${actionUrl}`;
    } else {
      finalActionUrl = `${hubFrontendUrl}/${actionUrl}`;
    }
  }
  
  // Логотип (можно добавить реальный путь к логотипу)
  const logoUrl = `${hubFrontendUrl}/favicon.svg`; // Или путь к логотипу портала
  
  const cta = finalActionUrl
    ? `<tr><td align="center" style="padding: 24px 0 0 0;">
          <a href="${escapeAttr(finalActionUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;border-radius:8px;background:${colors.buttonBg};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;transition:background 0.2s">${escapeHtml(actionText)}</a>
        </td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body{margin:0;background:${colors.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${colors.text};line-height:1.6}
    .container{max-width:640px;margin:0 auto;padding:24px}
    .card{background:${colors.card};border-radius:12px;border:1px solid ${colors.border};box-shadow:0 4px 6px -1px rgba(0,0,0,${isDark ? '0.4' : '0.1'}),0 2px 4px -2px rgba(0,0,0,${isDark ? '0.4' : '0.1'})}
    .header{background:${colors.headerGradient};color:#ffffff;border-radius:12px 12px 0 0;padding:24px;position:relative}  
    .logo{display:inline-block;margin-bottom:12px;max-width:120px;height:auto}
    .title{margin:4px 0 0 0;font-size:20px;line-height:1.4;font-weight:700}
    .sub{margin:0;font-size:13px;color:rgba(255,255,255,0.9)}
    .content{padding:24px;color:${colors.text}}
    .footer{padding:16px 24px;border-top:1px solid ${colors.border};color:${colors.textTertiary};font-size:12px;border-radius:0 0 12px 12px;background:${colors.card}}
    .message{font-size:15px;line-height:1.7;color:${colors.text}}
  </style>
  <!--[if mso]>
  <style>
    .title{font-size:22px !important}
    .header{background:#0ea5e9 !important}
    </style>
    <![endif]-->
</head>
<body>
    <div class="container">
      <table class="card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        <tr>
          <td class="header">
            <img src="${escapeAttr(logoUrl)}" alt="DNS Hub" class="logo" style="max-width:120px;height:auto;display:block;margin-bottom:12px" />
            <div style="font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${escapeHtml(toolName)}</div>
            <div class="title">${title}</div>
          </td>
        </tr>
        <tr>
          <td class="content">
            <div class="message">${message}</div>
            ${cta}
          </td>
        </tr>
        <tr>
          <td class="footer">
            <div style="margin-bottom:4px">Отправитель: <strong>${escapeHtml(senderName)}</strong>${senderEmail}</div>
            ${createdAt ? `<div style="color:${colors.textTertiary};font-size:11px">${escapeHtml(createdAt)}</div>` : ''}
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${colors.border};color:${colors.textTertiary};font-size:11px">
              ${toolName !== brand ? `${escapeHtml(brand)} · ` : ''}Автоматическое уведомление
            </div>
          </td>
        </tr>
      </table>
    </div>
</body>
</html>`;
}

// Простой HTML-шаблон для sendRaw с учетом темы
function generateBasicHtml(subject: string, message: string, subtitle?: string, isDark: boolean = false): string {
  const safeSubject = escapeHtml(subject);
  const safeMessage = nl2br(message);
  const sub = subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : '';
  
  const colors = isDark ? {
    bg: '#082f49',
    card: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#cbd5e1',
    border: '#334155',
    headerGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
  } : {
    bg: '#f8fafc',
    card: '#ffffff',
    text: '#0f172a',
    textSecondary: '#475569',
    border: '#e2e8f0',
    headerGradient: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
  };
  
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${safeSubject}</title>
  <style>body{margin:0;background:${colors.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${colors.text};line-height:1.6}.container{max-width:640px;margin:0 auto;padding:24px}.card{background:${colors.card};border-radius:12px;border:1px solid ${colors.border};box-shadow:0 4px 6px -1px rgba(0,0,0,${isDark ? '0.4' : '0.1'}),0 2px 4px -2px rgba(0,0,0,${isDark ? '0.4' : '0.1'})}.header{background:${colors.headerGradient};color:#ffffff;border-radius:12px 12px 0 0;padding:24px}.title{margin:0;font-size:20px;font-weight:700}.sub{margin:4px 0 0 0;font-size:13px;color:rgba(255,255,255,0.9)}.content{padding:24px;color:${colors.text}}</style></head>
  <body><div class="container"><table class="card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td class="header"><div class="title">${safeSubject}</div>${sub}</td></tr><tr><td class="content"><div style="font-size:15px;line-height:1.7">${safeMessage}</div></td></tr></table></div></body></html>`;
}

// Проверка корпоративного email
function isCorporateEmail(email: string): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase().trim();
  const allowedDomains = ['@dns-shop.ru', '@dns-loc.ru'];
  return allowedDomains.some(domain => emailLower.endsWith(domain));
}

// Отправка уведомления
async function send(notification: NotificationWithRelations): Promise<boolean> {
  if (!transporter || !notification.receiver?.email) {
    return false;
  }
  
  // Проверка на корпоративный email для уведомлений из merchbot
  // Проверяем по имени инструмента или по link (если есть в metadata)
  const toolName = notification.tool?.name?.toLowerCase() || '';
  const toolLink = (notification.tool as any)?.link?.toLowerCase() || '';
  const isMerchTool = toolName.includes('мерч') || toolName.includes('merch') || 
                      toolLink.includes('merch') || toolLink.includes('retail/merch') || 
                      toolLink.includes('ad/merch');
  
  if (isMerchTool && !isCorporateEmail(notification.receiver.email)) {
    console.warn(`[EmailService] Skipping email to non-corporate address for merch tool: ${notification.receiver.email}`);
    return false;
  }
  
  // Получаем тему пользователя из настроек
  let isDark = false;
  try {
    if (notification.receiverId) {
      const themeSetting = await prisma.userSettings.findUnique({
        where: {
          userId_parameter: {
            userId: notification.receiverId,
            parameter: 'theme',
          },
        },
      });
      // Если тема не найдена, проверяем альтернативный параметр
      if (!themeSetting) {
        const colorSchemeSetting = await prisma.userSettings.findUnique({
          where: {
            userId_parameter: {
              userId: notification.receiverId,
              parameter: 'colorScheme',
            },
          },
        });
        if (colorSchemeSetting) {
          isDark = colorSchemeSetting.value === 'dark';
        }
      } else {
        isDark = themeSetting.value === 'dark';
      }
    }
  } catch (error) {
    console.warn('[EmailService] Failed to get user theme, using light theme:', error);
    // По умолчанию используем светлую тему
    isDark = false;
  }
  
  try {
    await transporter.sendMail({
      from: `"${notification.sender?.name ?? 'DNS Hub'}" <${process.env.EMAIL_USER}>`,
      to: notification.receiver.email,
      subject: notification.title,
      text: generatePlainText(notification),
      html: generateHtml(notification, isDark),
    });
    
    // Обновляем уведомление, добавляя пометку о том, что оно было отправлено через почту
    // Это нужно для отображения пометки "Outlook" в интерфейсе
    if (notification.action && typeof notification.action === 'object') {
      const action = notification.action as any;
      if (!action.source && !action.isEmailNotification) {
        // Обновляем action, добавляя метаданные о почте
        await prisma.notifications.update({
          where: { id: notification.id },
          data: {
            action: {
              ...action,
              isEmailNotification: true,
              source: 'outlook'
            }
          }
        });
      }
    } else {
      // Если action пустой, создаем новый
      await prisma.notifications.update({
        where: { id: notification.id },
        data: {
          action: {
            isEmailNotification: true,
            source: 'outlook'
          }
        }
      });
    }
    
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
  sendRaw: async (toEmail: string, subject: string, message: string, senderName?: string, userId?: string): Promise<boolean> => {
    if (!transporter || !toEmail) return false;
    
    // Получаем тему пользователя, если передан userId
    let isDark = false;
    if (userId) {
      try {
        const themeSetting = await prisma.userSettings.findUnique({
          where: {
            userId_parameter: {
              userId: userId,
              parameter: 'theme',
            },
          },
        });
        if (!themeSetting) {
          const colorSchemeSetting = await prisma.userSettings.findUnique({
            where: {
              userId_parameter: {
                userId: userId,
                parameter: 'colorScheme',
              },
            },
          });
          if (colorSchemeSetting) {
            isDark = colorSchemeSetting.value === 'dark';
          }
        } else {
          isDark = themeSetting.value === 'dark';
        }
      } catch (error) {
        console.warn('[EmailService] Failed to get user theme for sendRaw, using light theme:', error);
      }
    }
    
    try {
      await transporter.sendMail({
        from: `"${senderName ?? 'DNS Hub'}" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject,
        text: message,
        html: generateBasicHtml(subject, message, 'Почтовое уведомление', isDark)
      });
      return true;
    } catch (error) {
      console.error('Failed to send raw email:', error);
      return false;
    }
  }
};