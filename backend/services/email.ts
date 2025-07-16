// services/email.js
import nodemailer from 'nodemailer';
import { NotificationWithRelations } from '../controllers/app/notification.js';
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
  return `
    ${notification.message}
    
    Отправитель: ${notification.sender.name}
    ${notification.sender.email ? `Email: ${notification.sender.email}` : ''}
    ${notification.tool ? `Сервис: ${notification.tool.name}` : ''}
  `.trim();
}

// Генерация HTML письма
function generateHtml(notification: NotificationWithRelations): string {
  return `
    <!-- HTML шаблон письма -->
    <!-- ... (оставляем ваш существующий HTML шаблон) ... -->
  `;
}

// Отправка уведомления
async function send(notification: NotificationWithRelations): Promise<boolean> {
  if (!transporter || !notification.receiver?.email) {
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"${notification.sender.name}" <${process.env.EMAIL_USER}>`,
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
  isConfigured: () => !!transporter
};