import nodemailer from 'nodemailer';
import { NotificationWithRelations } from '../controllers/app/notification.js';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

export class EmailService {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter | null = null;

  private constructor() {
    this.initializeTransport();
  }

  private initializeTransport() {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
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
      this.transporter = null;
    }
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  public async sendNotification(notification: NotificationWithRelations): Promise<boolean> {
    if (!this.transporter || !notification.receiver?.email) {
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"${notification.sender.name}" <${process.env.EMAIL_USER}>`,
        to: notification.receiver.email,
        subject: notification.title,
        text: this.generatePlainText(notification),
        html: this.generateHtml(notification),
      });
      return true;
    } catch {
      return false;
    }
  }

  private generatePlainText(notification: NotificationWithRelations): string {
    return `
      ${notification.message}
      
      Отправитель: ${notification.sender.name}
      ${notification.sender.email ? `Email: ${notification.sender.email}` : ''}
      ${notification.tool ? `Сервис: ${notification.tool.name}` : ''}
    `.trim();
  }

private generateHtml(notification: NotificationWithRelations): string {
  return `
    <!--[if mso]>
    <style type="text/css">
      .main-table { width: 100% !important; }
      .header-bg { background: #4a6cf7 !important; }
    </style>
    <![endif]-->
    <table class="main-table" width="600" align="center" cellpadding="0" cellspacing="0" border="0" style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; width: 100%;">
      <!-- Шапка -->
      <tr>
        <td class="header-bg" style="padding: 30px 20px; background: linear-gradient(135deg, #6e8efb, #4a6cf7); text-align: center;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-bottom: 15px;">
                <img src="https://example.com/logo-white.png" alt="Логотип" width="180" style="display: block; margin: 0 auto; width: 180px;">
              </td>
            </tr>
            <tr>
              <td>
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Новое уведомление</h1>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Контент -->
      <tr>
        <td style="padding: 30px 25px; background: #ffffff;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-bottom: 25px;">
                <div style="font-size: 16px; line-height: 1.6; color: #444444;">
                  ${notification.message}
                </div>
              </td>
            </tr>
            
            <!-- Карточка с информацией -->
            <tr>
              <td style="padding: 20px; background: #f8f9fa; border-left: 4px solid #4a6cf7;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding: 5px 0;">
                      <span style="display: inline-block; width: 100px; color: #777777;">Отправитель:</span>
                      <strong>${notification.sender.name}</strong>
                    </td>
                  </tr>
                  ${notification.sender.email ? `
                  <tr>
                    <td style="padding: 5px 0;">
                      <span style="display: inline-block; width: 100px; color: #777777;">Email:</span>
                      <strong>${notification.sender.email}</strong>
                    </td>
                  </tr>` : ''}
                  ${notification.tool ? `
                  <tr>
                    <td style="padding: 5px 0;">
                      <span style="display: inline-block; width: 100px; color: #777777;">Сервис:</span>
                      <strong>${notification.tool.name}</strong>
                    </td>
                  </tr>` : ''}
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      
      <!-- Подвал -->
      <tr>
        <td style="padding: 20px; background: #f5f7fa; text-align: center; font-size: 12px; color: #777777;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-bottom: 10px;">
                <a href="#" style="margin: 0 10px; color: #4a6cf7; text-decoration: none;">Сайт</a>
                <a href="#" style="margin: 0 10px; color: #4a6cf7; text-decoration: none;">Поддержка</a>
                <a href="#" style="margin: 0 10px; color: #4a6cf7; text-decoration: none;">Контакты</a>
              </td>
            </tr>
            <tr>
              <td>
                © ${new Date().getFullYear()} Ваша компания. Все права защищены.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
}