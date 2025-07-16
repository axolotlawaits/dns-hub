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
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
    <meta charset="UTF-8">
    <meta content="width=device-width, initial-scale=1" name="viewport">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta content="telephone=no" name="format-detection">
    <title></title>
    <!--[if (mso 16)]>
    <style type="text/css">
    a {text-decoration: none;}
    </style>
    <![endif]-->
    <!--[if gte mso 9]><style>sup { font-size: 100% !important; }</style><![endif]-->
    <!--[if gte mso 9]>
<noscript>
         <xml>
           <o:OfficeDocumentSettings>
           <o:AllowPNG></o:AllowPNG>
           <o:PixelsPerInch>96</o:PixelsPerInch>
           </o:OfficeDocumentSettings>
         </xml>
      </noscript>
<![endif]-->
    <!--[if mso]><xml>
    <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
      <w:DontUseAdvancedTypographyReadingMail></w:DontUseAdvancedTypographyReadingMail>
    </w:WordDocument>
    </xml><![endif]-->
</head>

<body>
    <div dir="ltr" class="es-wrapper-color">
        <!--[if gte mso 9]>
			<v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
				<v:fill type="tile" color="#181818"></v:fill>
			</v:background>
		<![endif]-->
        <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0">
            <tbody>
                <tr>
                    <td class="esd-email-paddings" valign="top">
                        <table class="esd-header-popover es-header" cellspacing="0" cellpadding="0" align="center">
                            <tbody>
                                <tr>
                                    <td class="esd-stripe" align="center">
                                        <table class="es-header-body" width="600" cellspacing="0" cellpadding="0" bgcolor="#ffffff" align="center">
                                            <tbody>
                                                <tr>
                                                    <td class="esd-structure es-p20t es-p10b es-p20r es-p20l" esd-general-paddings-checked="true" esd-custom-block-id="14346" align="left" bgcolor="#25292B" style="background-color: #25292b;">
                                                        <!--[if mso]><table width="560" cellpadding="0" cellspacing="0"><tr><td width="282" valign="top"><![endif]-->
                                                        <table class="es-left" cellspacing="0" cellpadding="0" align="left">
                                                            <tbody>
                                                                <tr>
                                                                    <td width="282" class="es-m-p0r esd-container-frame" valign="top" align="center">
                                                                        <table cellpadding="0" cellspacing="0" width="100%">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td align="center" class="esd-block-image" style="font-size: 0px;"><a target="_blank"><img class="adapt-img" src="https://ympiqw.stripocdn.email/content/guids/CABINET_d8c15b5cdceddd62e9fe275bdb98e6afc89eddc67ee186f9e4fd89bdd06e60a2/images/logo_white_orange_h_dns_hub_1.png" alt style="display: block;" width="282"></a></td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        <!--[if mso]></td><td width="40"></td><td width="238" valign="top"><![endif]-->
                                                        <table class="es-right" cellspacing="0" cellpadding="0" align="right">
                                                            <tbody>
                                                                <tr>
                                                                    <td class="esd-container-frame" width="238" align="left">
                                                                        <table width="100%" cellspacing="0" cellpadding="0">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td class="esd-block-text es-m-txt-l es-p5t" align="right">
                                                                                        <p style="font-size: 20px; color: #ffffff;"><b>${notification.tool}</b></p>
                                                                                    </td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        <!--[if mso]></td></tr></table><![endif]-->
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td class="esd-structure es-p40t es-p20r es-p20l" align="left" bgcolor="#25292b" style="background-color: #25292b;">
                                                        <!--[if mso]><table width="560" cellpadding="0" cellspacing="0"><tr><td width="270" valign="top"><![endif]-->
                                                        <table cellpadding="0" cellspacing="0" class="es-left" align="left">
                                                            <tbody>
                                                                <tr>
                                                                    <td width="270" class="es-m-p20b esd-container-frame" align="left">
                                                                        <table cellpadding="0" cellspacing="0" width="100%">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td align="left" class="esd-block-text" bgcolor="#25292b">
                                                                                        <p style="color: #ffffff;"><strong>${notification.title}</strong></p>
                                                                                    </td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        <!--[if mso]></td><td width="20"></td><td width="270" valign="top"><![endif]-->
                                                        <table cellpadding="0" cellspacing="0" class="es-right" align="right">
                                                            <tbody>
                                                                <tr>
                                                                    <td width="270" align="left" class="esd-container-frame">
                                                                        <table cellpadding="0" cellspacing="0" width="100%">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td align="right" class="esd-block-text" bgcolor="#25292b">
                                                                                        <p style="font-size: 17px; color: #ffffff;"><strong>Автор:</strong> ${notification.sender.name}</p>
                                                                                        <p style="font-size: 17px; color: #ffffff;"><strong></strong></p>
                                                                                    </td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                        <!--[if mso]></td></tr></table><![endif]-->
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <table class="es-content" cellspacing="0" cellpadding="0" align="center">
                            <tbody>
                                <tr>
                                    <td class="esd-stripe" align="center">
                                        <table class="es-content-body" width="600" cellspacing="0" cellpadding="0" bgcolor="#25292B" align="center">
                                            <tbody>
                                                <tr>
                                                    <td class="es-p20t es-p20r es-p20l esd-structure" align="left">
                                                        <table width="100%" cellspacing="0" cellpadding="0">
                                                            <tbody>
                                                                <tr>
                                                                    <td class="esd-container-frame" width="560" valign="top" align="center">
                                                                        <table width="100%" cellspacing="0" cellpadding="0">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td align="left" class="esd-block-text es-p25t">
                                                                                        <p><br></p>
                                                                                    </td>
                                                                                </tr>
                                                                                <tr>
                                                                                    <td align="left" class="esd-block-text">
                                                                                        <p><br></p>
                                                                                    </td>
                                                                                </tr>
                                                                                <tr>
                                                                                    <td align="center" class="esd-block-button es-p35t">
                                                                                        <!--[if mso]><a href="" target="_blank" hidden>
	<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" esdevVmlButton href="" 
                style="height:41px; v-text-anchor:middle; width:218px" arcsize="0%" strokecolor="#f9b17a" strokeweight="3px" fillcolor="#25292b">
		<w:anchorlock></w:anchorlock>
		<center style='color:#ffffff; font-family:arial, "helvetica neue", helvetica, sans-serif; font-size:15px; font-weight:700; line-height:15px;  mso-text-raise:1px'>Перейти к заявке</center>
	</v:roundrect></a>
<![endif]-->
                                                                                        <!--[if !mso]><!-- --><span class="msohide es-button-border" style="border-radius: 0px; border-width: 3px; background: #25292b; border-color: #f9b17a;"><a href class="es-button" target="_blank" style="border-radius: 0px; font-weight: bold; background: #25292b; mso-border-alt: 10px solid #25292b">Перейти к заявке</a></span>
                                                                                        <!--<![endif]-->
                                                                                    </td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <table class="esd-footer-popover es-footer" cellspacing="0" cellpadding="0" align="center">
                            <tbody>
                                <tr>
                                    <td class="esd-stripe" align="center">
                                        <table class="es-footer-body" width="600" cellspacing="0" cellpadding="0" bgcolor="#25292b" align="center">
                                            <tbody>
                                                <tr>
                                                    <td class="esd-structure es-p20" align="left">
                                                        <table width="100%" cellspacing="0" cellpadding="0">
                                                            <tbody>
                                                                <tr>
                                                                    <td class="esd-container-frame" width="560" valign="top" align="center">
                                                                        <table width="100%" cellspacing="0" cellpadding="0">
                                                                            <tbody>
                                                                                <tr>
                                                                                    <td align="center" class="esd-block-spacer es-p15" style="font-size:0">
                                                                                        <table border="0" width="100%" height="100%" cellpadding="0" cellspacing="0">
                                                                                            <tbody>
                                                                                                <tr>
                                                                                                    <td style="border-bottom: 1px solid #f9b17a; background: unset; height: 0px; width: 100%; margin: 0px;"></td>
                                                                                                </tr>
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </td>
                                                                                </tr>
                                                                                <tr>
                                                                                    <td align="center" class="esd-block-text">
                                                                                        <p style="color: #ffffff;">г. Новосибирск, Федосеева 24/3</p>
                                                                                        <p style="color: #ffffff;">[MSK+4] [UTC+7]</p>
                                                                                    </td>
                                                                                </tr>
                                                                            </tbody>
                                                                        </table>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</body>

</html>
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