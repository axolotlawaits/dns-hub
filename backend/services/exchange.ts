// Сервис для работы с Microsoft Exchange через EWS
import { prisma } from '../server.js';
import httpntlm from 'httpntlm';
import { XMLParser } from 'fast-xml-parser';
import { decrypt, needsReencryption, encrypt } from '../utils/encryption.js';
import { SocketIOService } from '../socketio.js';
import { NotificationController } from '../controllers/app/notification.js';

// Конфигурация Exchange из .env (только EWS)
const EXCHANGE_CONFIG = {
  ewsUrl: process.env.EXCHANGE_EWS_URL || '',
  owaUrl: process.env.EXCHANGE_OWA_URL || '',
  ewsUsername: process.env.EXCHANGE_EWS_USERNAME || process.env.LDAP_SERVICE_USER || '',
  ewsPassword: process.env.EXCHANGE_EWS_PASSWORD || process.env.LDAP_SERVICE_PASSWORD || '',
  ewsDomain: process.env.EXCHANGE_EWS_DOMAIN || '',
  ewsVersion: process.env.EXCHANGE_EWS_VERSION || 'Exchange2016',
};

// Конфигурация Exchange загружена
// Интерфейс для события календаря
export interface ExchangeCalendarEvent {
  id?: string;
  subject: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: 'required' | 'optional';
  }>;
  isAllDay?: boolean;
  reminderMinutesBeforeStart?: number;
  categories?: string[];
  sensitivity?: 'normal' | 'personal' | 'private' | 'confidential';
}

// XML парсер для SOAP ответов
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
  parseTagValue: true
});

// Кэш для отслеживания последней проверки писем
interface EmailCheckCache {
  lastCheckTime: Date;
  lastMessageId: string | null;
}

const emailCheckCache = new Map<string, EmailCheckCache>();

// Получение EWS URL (автоматически определяется из OWA URL если не указан)
const getEwsUrl = (): string => {
  if (EXCHANGE_CONFIG.ewsUrl) {
    return EXCHANGE_CONFIG.ewsUrl;
  }
  
  if (EXCHANGE_CONFIG.owaUrl) {
    // Автоматически определяем EWS URL из OWA URL
    const owaUrl = EXCHANGE_CONFIG.owaUrl.replace(/\/owa\/?$/, '');
    return `${owaUrl}/EWS/Exchange.asmx`;
  }
  
  throw new Error('EWS URL not configured. Please set EXCHANGE_EWS_URL or EXCHANGE_OWA_URL');
};

// Выполнение EWS запроса с NTLM аутентификацией
const makeEwsRequest = async (
  ewsUrl: string,
  soapEnvelope: string,
  action: string,
  username: string,
  password: string,
  domain: string = ''
): Promise<{ statusCode: number; body: string }> => {
  // Формируем NTLM username: если username содержит @, используем как UPN (без domain)
  // Иначе используем domain\username формат
  let finalNtlmUsername: string;
  if (username.includes('@')) {
    // UPN формат (email) - используем как есть без домена
    finalNtlmUsername = username;
  } else if (domain) {
    // Domain\Username формат
    finalNtlmUsername = `${domain}\\${username}`;
  } else {
    // Просто username без домена
    finalNtlmUsername = username;
  }
  
  
  return new Promise((resolve, reject) => {
    httpntlm.post({
      url: ewsUrl,
      username: finalNtlmUsername,
      password: password,
      workstation: '',
      domain: domain,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': action
      },
      body: soapEnvelope
    }, (err: any, res: any) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (res.statusCode !== 200) {
        const bodyPreview = res.body ? res.body.substring(0, 2000) : '(no body)';
        console.error(`[Exchange] [makeEwsRequest] ${res.statusCode} Error response body:`, bodyPreview);
      }
      
      resolve({
        statusCode: res.statusCode,
        body: res.body || ''
      });
    });
  });
};

// Парсинг SOAP ответа с событиями календаря
const parseCalendarEventsFromSoap = (soapXml: string): ExchangeCalendarEvent[] => {
  try {
    const parsed = xmlParser.parse(soapXml);
    
    const envelope = parsed['s:Envelope'] || parsed['soap:Envelope'] || parsed.Envelope;
    if (!envelope) {
      console.warn('[Exchange] [parseCalendarEventsFromSoap] No envelope found in parsed XML');
      return [];
    }
    
    const body = envelope?.['s:Body'] || envelope?.['soap:Body'] || envelope?.Body;
    if (!body) {
      console.warn('[Exchange] [parseCalendarEventsFromSoap] No body found in envelope');
      return [];
    }
    
    const findItemResponse = body?.['m:FindItemResponse'] || body?.FindItemResponse;
    if (!findItemResponse) {
      console.warn('[Exchange] [parseCalendarEventsFromSoap] No FindItemResponse found in body');
      return [];
    }
    
    const responseMessages = findItemResponse?.['m:ResponseMessages'] || findItemResponse?.ResponseMessages;
    if (!responseMessages) {
      console.warn('[Exchange] [parseCalendarEventsFromSoap] No ResponseMessages found');
      return [];
    }
    
    const findItemResponseMessage = responseMessages?.['m:FindItemResponseMessage'] || responseMessages?.FindItemResponseMessage;
    
    const responseMessagesArray = Array.isArray(findItemResponseMessage) 
      ? findItemResponseMessage 
      : findItemResponseMessage ? [findItemResponseMessage] : [];


    const events: ExchangeCalendarEvent[] = [];

    for (const responseMsg of responseMessagesArray) {
      const responseCode = responseMsg?.['m:ResponseCode'] || responseMsg?.ResponseCode;
      
      if (responseCode !== 'NoError' && responseCode !== 'Success') {
        console.warn(`[Exchange] [parseCalendarEventsFromSoap] Skipping message with code: ${responseCode}`);
        continue;
      }

      const rootFolder = responseMsg?.['m:RootFolder'] || responseMsg?.RootFolder;
      if (!rootFolder) {
        console.warn('[Exchange] [parseCalendarEventsFromSoap] No RootFolder found in response message');
        continue;
      }
      
      const items = rootFolder?.['t:Items'] || rootFolder?.Items;
      if (!items) {
        continue;
      }
      
      const calendarItem = items?.['t:CalendarItem'] || items?.CalendarItem;
      const calendarItemsArray = Array.isArray(calendarItem) ? calendarItem : calendarItem ? [calendarItem] : [];
      

      for (const item of calendarItemsArray) {
        const itemId = item['t:ItemId']?.['@_Id'] || item.ItemId?.['@_Id'] || '';
        const subject = item['t:Subject'] || item.Subject || '';
        const start = item['t:Start'] || item.Start || '';
        const end = item['t:End'] || item.End || '';
        const locationRaw = item['t:Location'] || item.Location || '';
        const bodyContent = item['t:Body'] || item.Body || {};
        const isAllDay = item['t:IsAllDayEvent'] === 'true' || item.IsAllDayEvent === 'true';
        const reminder = item['t:ReminderMinutesBeforeStart'] || item.ReminderMinutesBeforeStart;

        // Обрабатываем location: может быть строкой или объектом
        let locationDisplayName: string | undefined;
        if (locationRaw) {
          if (typeof locationRaw === 'string') {
            locationDisplayName = locationRaw;
          } else if (locationRaw['#text']) {
            locationDisplayName = locationRaw['#text'];
          } else if (locationRaw.displayName) {
            locationDisplayName = locationRaw.displayName;
          } else if (typeof locationRaw === 'object') {
            // Пробуем найти строковое значение в объекте
            const locationStr = Object.values(locationRaw).find(v => typeof v === 'string') as string | undefined;
            locationDisplayName = locationStr;
          }
        }

        // Генерируем id, если его нет (для совместимости с фронтендом)
        const eventId = itemId || `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        events.push({
          id: eventId,
          subject: subject,
          body: bodyContent['#text'] || bodyContent ? {
            contentType: (bodyContent['@_BodyType'] || bodyContent.BodyType || 'text').toLowerCase() === 'html' ? 'html' : 'text',
            content: bodyContent['#text'] || bodyContent || ''
          } : undefined,
          start: {
            dateTime: start,
            timeZone: 'UTC'
          },
          end: {
            dateTime: end,
            timeZone: 'UTC'
          },
          location: locationDisplayName ? {
            displayName: locationDisplayName
          } : undefined,
          isAllDay: isAllDay,
          reminderMinutesBeforeStart: reminder ? parseInt(reminder) : undefined
        });
      }
    }

    return events;
  } catch (error: any) {
    console.error('[Exchange] [parseCalendarEventsFromSoap] Error parsing SOAP:', error.message);
    console.error('[Exchange] [parseCalendarEventsFromSoap] Error stack:', error.stack);
    return [];
  }
};

// Получение событий календаря через EWS
const getCalendarEventsViaEWS = async (
  userEmail: string,
  startDateTime?: Date,
  endDateTime?: Date,
  userId?: string,
  req?: any
): Promise<ExchangeCalendarEvent[]> => {
  try {
    const ewsUrl = getEwsUrl();
    
    let ewsUsername = EXCHANGE_CONFIG.ewsUsername;
    let ewsPassword = EXCHANGE_CONFIG.ewsPassword;
    let ewsDomain = EXCHANGE_CONFIG.ewsDomain;
    let useImpersonation = true;
    let userPassword: string | null = null;
    
    let userPasswordMissing = false;
    if (userId) {
      try {
        userPassword = await getUserExchangePassword(userId, req);
        if (userPassword) {
          // Используем пароль пользователя напрямую (LDAP password = Exchange password)
          ewsUsername = userEmail;
          ewsPassword = userPassword;
          ewsDomain = '';
          useImpersonation = false;
        } else {
          // Пароль не найден или в старом формате - используем Impersonation
          userPasswordMissing = true;
          useImpersonation = true;
        }
      } catch (passwordError: any) {
        // Если ошибка при получении пароля, используем Impersonation
        userPasswordMissing = true;
        useImpersonation = true;
      }
    }
    
    if (!ewsUsername || !ewsPassword) {
      throw new Error('EWS username and password are required');
    }
    
    let ntlmUsername = ewsUsername;
    let ntlmDomain = ewsDomain;
    
    // Если используем прямой доступ с паролем пользователя (не Impersonation)
    if (!useImpersonation && userEmail.includes('@')) {
      // Для прямого доступа используем email напрямую (UPN формат)
      // Exchange может принимать email как username без домена
      ntlmUsername = userEmail; // Используем полный email как username
      ntlmDomain = ''; // Не используем домен для UPN формата
    } else if (ntlmUsername.includes('@')) {
      // Для Impersonation используем сервисный аккаунт
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && ewsUsername.includes('@')) {
        const emailParts = ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    } else if (ntlmUsername.includes('\\')) {
      const parts = ntlmUsername.split('\\');
      ntlmDomain = parts[0];
      ntlmUsername = parts[1];
    }

    const startDate = startDateTime ? startDateTime.toISOString() : new Date().toISOString();
    const endDate = endDateTime ? endDateTime.toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const impersonationHeader = useImpersonation ? `
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>` : '';
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />${impersonationHeader}
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
      </m:ItemShape>
      <m:CalendarView MaxEntriesReturned="100" StartDate="${startDate}" EndDate="${endDate}" />
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="calendar">
          <t:Mailbox>
            <t:EmailAddress>${userEmail}</t:EmailAddress>
          </t:Mailbox>
        </t:DistinguishedFolderId>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;

    
    let response;
    try {
      response = await makeEwsRequest(
        ewsUrl,
        soapEnvelope,
        'http://schemas.microsoft.com/exchange/services/2006/messages/FindItem',
        ntlmUsername,
        ewsPassword,
        ntlmDomain
      );
    } finally {
      if (userPassword) {
        ewsPassword = '';
        userPassword = null;
        ntlmUsername = '';
      }
    }

    if (response.statusCode !== 200) {
      const responseBody = response.body || '';
      
      console.error(`[Exchange] [getCalendarEventsViaEWS] ❌ EWS request failed with status code ${response.statusCode}`);
      console.error(`[Exchange] [getCalendarEventsViaEWS] ❌ Full response body:`, responseBody);
      
      // Проверяем на специфичные ошибки Exchange
      if (responseBody.includes('ErrorNonExistentMailbox')) {
        return [];
      }
      
      if (responseBody.includes('ErrorInvalidUserPrincipalName')) {
        return [];
      }
      
      // Проверяем на ошибки аутентификации
      if (response.statusCode === 401) {
        let authError = 'Unauthorized access to Exchange';
        if (userPasswordMissing) {
          authError = 'User Exchange password not configured. Please set your Exchange password in settings, or check Impersonation service account credentials (EXCHANGE_EWS_USERNAME and EXCHANGE_EWS_PASSWORD)';
        } else if (useImpersonation) {
          authError = 'Impersonation authentication failed. Check EXCHANGE_EWS_USERNAME, EXCHANGE_EWS_PASSWORD, and Impersonation permissions';
        } else {
          authError = 'User authentication failed. Check Exchange password in settings';
        }
        console.error(`[Exchange] [getCalendarEventsViaEWS] ❌ ${authError}`);
        throw new Error(`EWS authentication failed (401): ${authError}`);
      }
      
      console.error(`[Exchange] [getCalendarEventsViaEWS] Response body (first 2000 chars):`, responseBody.substring(0, 2000));
      throw new Error(`EWS request failed with status code ${response.statusCode}`);
    }

    const parsedEvents = parseCalendarEventsFromSoap(response.body);
    return parsedEvents;
  } catch (error: any) {
    const errorBody = error.body || '';
    if (errorBody.includes('ErrorNonExistentMailbox') || errorBody.includes('no mailbox')) {
      return [];
    }
    console.error('[Exchange] [getCalendarEventsViaEWS] Error:', error.message);
    throw error;
  }
};

// Получение событий календаря (публичный API)
export const getCalendarEvents = async (
  userEmail: string,
  startDateTime?: Date,
  endDateTime?: Date,
  userId?: string,
  req?: any
): Promise<ExchangeCalendarEvent[]> => {
  return getCalendarEventsViaEWS(userEmail, startDateTime, endDateTime, userId, req);
};

// Создание события календаря
export const createCalendarEvent = async (
  userEmail: string,
  event: ExchangeCalendarEvent
): Promise<ExchangeCalendarEvent | null> => {
  try {
    const ewsUrl = getEwsUrl();
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>
  </soap:Header>
  <soap:Body>
    <m:CreateItem SendMeetingInvitations="SendToAllAndSaveCopy">
      <m:Items>
        <t:CalendarItem>
          <t:Subject>${event.subject}</t:Subject>
          ${event.body ? `<t:Body BodyType="${event.body.contentType}">${event.body.content}</t:Body>` : ''}
          <t:Start>${event.start.dateTime}</t:Start>
          <t:End>${event.end.dateTime}</t:End>
          ${event.location ? `<t:Location>${event.location.displayName}</t:Location>` : ''}
          ${event.isAllDay ? '<t:IsAllDayEvent>true</t:IsAllDayEvent>' : ''}
          ${event.reminderMinutesBeforeStart ? `<t:ReminderMinutesBeforeStart>${event.reminderMinutesBeforeStart}</t:ReminderMinutesBeforeStart>` : ''}
          ${event.attendees ? `
          <t:RequiredAttendees>
            ${event.attendees.filter(a => a.type === 'required').map(a => `
            <t:Attendee>
              <t:Mailbox>
                <t:EmailAddress>${a.emailAddress.address}</t:EmailAddress>
              </t:Mailbox>
            </t:Attendee>
            `).join('')}
          </t:RequiredAttendees>
          <t:OptionalAttendees>
            ${event.attendees.filter(a => a.type === 'optional').map(a => `
            <t:Attendee>
              <t:Mailbox>
                <t:EmailAddress>${a.emailAddress.address}</t:EmailAddress>
              </t:Mailbox>
            </t:Attendee>
            `).join('')}
          </t:OptionalAttendees>
          ` : ''}
        </t:CalendarItem>
      </m:Items>
    </m:CreateItem>
  </soap:Body>
</soap:Envelope>`;

    let ntlmUsername = EXCHANGE_CONFIG.ewsUsername;
    let ntlmDomain = EXCHANGE_CONFIG.ewsDomain;
    
    if (ntlmUsername.includes('@')) {
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && EXCHANGE_CONFIG.ewsUsername.includes('@')) {
        const emailParts = EXCHANGE_CONFIG.ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    }

    const response = await makeEwsRequest(
      ewsUrl,
      soapEnvelope,
      'http://schemas.microsoft.com/exchange/services/2006/messages/CreateItem',
      ntlmUsername,
      EXCHANGE_CONFIG.ewsPassword,
      ntlmDomain
    );

    if (response.statusCode !== 200) {
      throw new Error(`Failed to create calendar event: ${response.statusCode}`);
    }

    // Парсим ответ и возвращаем созданное событие
    const parsed = xmlParser.parse(response.body);
    const envelope = parsed['s:Envelope'] || parsed['soap:Envelope'] || parsed.Envelope;
    const body = envelope?.['s:Body'] || envelope?.['soap:Body'] || envelope?.Body;
    const createItemResponse = body?.['m:CreateItemResponse'] || body?.CreateItemResponse;
    const responseMessages = createItemResponse?.['m:ResponseMessages'] || createItemResponse?.ResponseMessages;
    const createItemResponseMessage = responseMessages?.['m:CreateItemResponseMessage'] || responseMessages?.CreateItemResponseMessage;
    
    if (createItemResponseMessage) {
      const responseCode = createItemResponseMessage['m:ResponseCode'] || createItemResponseMessage.ResponseCode;
      if (responseCode === 'NoError' || responseCode === 'Success') {
        const items = createItemResponseMessage['m:Items'] || createItemResponseMessage.Items;
        const calendarItem = items?.['t:CalendarItem'] || items?.CalendarItem;
        const itemId = calendarItem?.['t:ItemId']?.['@_Id'] || calendarItem?.ItemId?.['@_Id'];
        
        return {
          ...event,
          id: itemId
        };
      }
    }

    return null;
  } catch (error: any) {
    console.error('[Exchange] [createCalendarEvent] Error:', error.message);
    throw error;
  }
};

// Обновление события календаря
export const updateCalendarEvent = async (
  userEmail: string,
  eventId: string,
  updateData: Partial<ExchangeCalendarEvent>
): Promise<ExchangeCalendarEvent | null> => {
  try {
    const ewsUrl = getEwsUrl();
    
    const updateFields: string[] = [];
    
    if (updateData.subject) {
      updateFields.push(`<t:Subject>${updateData.subject}</t:Subject>`);
    }
    if (updateData.body) {
      updateFields.push(`<t:Body BodyType="${updateData.body.contentType}">${updateData.body.content}</t:Body>`);
    }
    if (updateData.start) {
      updateFields.push(`<t:Start>${updateData.start.dateTime}</t:Start>`);
    }
    if (updateData.end) {
      updateFields.push(`<t:End>${updateData.end.dateTime}</t:End>`);
    }
    if (updateData.location) {
      updateFields.push(`<t:Location>${updateData.location.displayName}</t:Location>`);
    }
    if (updateData.isAllDay !== undefined) {
      updateFields.push(`<t:IsAllDayEvent>${updateData.isAllDay}</t:IsAllDayEvent>`);
    }
    if (updateData.reminderMinutesBeforeStart !== undefined) {
      updateFields.push(`<t:ReminderMinutesBeforeStart>${updateData.reminderMinutesBeforeStart}</t:ReminderMinutesBeforeStart>`);
    }

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>
  </soap:Header>
  <soap:Body>
    <m:UpdateItem ConflictResolution="AlwaysOverwrite">
      <m:ItemChanges>
        <t:ItemChange>
          <t:ItemId Id="${eventId}" />
          <t:Updates>
            <t:SetItemField>
              <t:FieldURI FieldURI="calendar:Subject" />
              <t:CalendarItem>
                ${updateFields.join('')}
              </t:CalendarItem>
            </t:SetItemField>
          </t:Updates>
        </t:ItemChange>
      </m:ItemChanges>
    </m:UpdateItem>
  </soap:Body>
</soap:Envelope>`;

    let ntlmUsername = EXCHANGE_CONFIG.ewsUsername;
    let ntlmDomain = EXCHANGE_CONFIG.ewsDomain;
    
    if (ntlmUsername.includes('@')) {
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && EXCHANGE_CONFIG.ewsUsername.includes('@')) {
        const emailParts = EXCHANGE_CONFIG.ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    }

    const response = await makeEwsRequest(
      ewsUrl,
      soapEnvelope,
      'http://schemas.microsoft.com/exchange/services/2006/messages/UpdateItem',
      ntlmUsername,
      EXCHANGE_CONFIG.ewsPassword,
      ntlmDomain
    );

    if (response.statusCode !== 200) {
      throw new Error(`Failed to update calendar event: ${response.statusCode}`);
    }

    // Получаем обновленное событие
    const events = await getCalendarEventsViaEWS(userEmail);
    return events.find(e => e.id === eventId) || null;
  } catch (error: any) {
    console.error('[Exchange] [updateCalendarEvent] Error:', error.message);
    throw error;
  }
};

// Удаление события календаря
export const deleteCalendarEvent = async (
  userEmail: string,
  eventId: string
): Promise<boolean> => {
  try {
    const ewsUrl = getEwsUrl();
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>
  </soap:Header>
  <soap:Body>
    <m:DeleteItem DeleteType="HardDelete" SendMeetingCancellations="SendToAllAndSaveCopy">
      <m:ItemIds>
        <t:ItemId Id="${eventId}" />
      </m:ItemIds>
    </m:DeleteItem>
  </soap:Body>
</soap:Envelope>`;

    let ntlmUsername = EXCHANGE_CONFIG.ewsUsername;
    let ntlmDomain = EXCHANGE_CONFIG.ewsDomain;
    
    if (ntlmUsername.includes('@')) {
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && EXCHANGE_CONFIG.ewsUsername.includes('@')) {
        const emailParts = EXCHANGE_CONFIG.ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    }

    const response = await makeEwsRequest(
      ewsUrl,
      soapEnvelope,
      'http://schemas.microsoft.com/exchange/services/2006/messages/DeleteItem',
      ntlmUsername,
      EXCHANGE_CONFIG.ewsPassword,
      ntlmDomain
    );

    return response.statusCode === 200;
  } catch (error: any) {
    console.error('[Exchange] [deleteCalendarEvent] Error:', error.message);
    return false;
  }
};

// Получение количества новых писем (по времени получения, не по статусу прочитанности)
const getNewEmailCount = async (
  userEmail: string,
  userId?: string,
  req?: any,
  lastCheckTime?: Date
): Promise<{ count: number; lastMessageTime?: Date; lastMessageId?: string }> => {
  try {
    const ewsUrl = getEwsUrl();
    
    let ewsUsername = EXCHANGE_CONFIG.ewsUsername;
    let ewsPassword = EXCHANGE_CONFIG.ewsPassword;
    let ewsDomain = EXCHANGE_CONFIG.ewsDomain;
    let useImpersonation = true;
    let userPassword: string | null = null;
    
    if (userId) {
      try {
        userPassword = await getUserExchangePassword(userId, req);
        if (userPassword) {
          ewsUsername = userEmail;
          ewsPassword = userPassword;
          ewsDomain = '';
          useImpersonation = false;
        }
      } catch (passwordError: any) {
        // Если пароль в старом формате или не найден, используем Impersonation
        useImpersonation = true;
      }
    }
    
    if (!ewsUsername || !ewsPassword) {
      throw new Error('EWS username and password are required');
    }
    
    
    let ntlmUsername = ewsUsername;
    let ntlmDomain = ewsDomain;
    
    if (ntlmUsername.includes('@')) {
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && ewsUsername.includes('@')) {
        const emailParts = ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    } else if (ntlmUsername.includes('\\')) {
      const parts = ntlmUsername.split('\\');
      ntlmDomain = parts[0];
      ntlmUsername = parts[1];
    }

    const impersonationHeader = useImpersonation ? `
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>` : '';
    
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />${impersonationHeader}
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>IdOnly</t:BaseShape>
        <t:AdditionalProperties>
          <t:FieldURI FieldURI="message:DateTimeReceived" />
        </t:AdditionalProperties>
      </m:ItemShape>
      <m:IndexedPageItemView MaxEntriesReturned="100" Offset="0" BasePoint="Beginning" />
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="inbox">
          <t:Mailbox>
            <t:EmailAddress>${userEmail}</t:EmailAddress>
          </t:Mailbox>
        </t:DistinguishedFolderId>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;

    let response;
    try {
      response = await makeEwsRequest(
        ewsUrl,
        soapEnvelope,
        'http://schemas.microsoft.com/exchange/services/2006/messages/FindItem',
        ntlmUsername,
        ewsPassword,
        ntlmDomain
      );
    } finally {
      if (userPassword) {
        ewsPassword = '';
        userPassword = null;
        ntlmUsername = '';
      }
    }

    if (response.statusCode !== 200) {
      const responseBody = response.body || '';
      if (responseBody.includes('ErrorNonExistentMailbox') || responseBody.includes('no mailbox')) {
        return { count: 0 };
      }
      throw new Error(`EWS request failed with status code ${response.statusCode}`);
    }

    try {
      const parsed = xmlParser.parse(response.body || '');
      const envelope = parsed['s:Envelope'] || parsed['soap:Envelope'] || parsed.Envelope;
      const body = envelope?.['s:Body'] || envelope?.['soap:Body'] || envelope?.Body;
      const findItemResponse = body?.['m:FindItemResponse'] || body?.FindItemResponse;
      const responseMessages = findItemResponse?.['m:ResponseMessages'] || findItemResponse?.ResponseMessages;
      const findItemResponseMessage = responseMessages?.['m:FindItemResponseMessage'] || responseMessages?.FindItemResponseMessage;
      
      const responseMessagesArray = Array.isArray(findItemResponseMessage) 
        ? findItemResponseMessage 
        : findItemResponseMessage ? [findItemResponseMessage] : [];

      let newCount = 0;
      let lastMessageTime: Date | undefined;
      let lastMessageId: string | undefined;

      for (const responseMsg of responseMessagesArray) {
        const responseCode = responseMsg?.['m:ResponseCode'] || responseMsg?.ResponseCode;
        if (responseCode !== 'NoError' && responseCode !== 'Success') {
          continue;
        }

        const rootFolder = responseMsg?.['m:RootFolder'] || responseMsg?.RootFolder;
        const items = rootFolder?.['t:Items'] || rootFolder?.Items;
        const message = items?.['t:Message'] || items?.Message;
        const messagesArray = Array.isArray(message) ? message : message ? [message] : [];

        for (const msg of messagesArray) {
          const itemId = msg['t:ItemId']?.['@_Id'] || msg.ItemId?.['@_Id'] || '';
          const receivedDateTime = msg['t:DateTimeReceived'] || msg.DateTimeReceived || '';
          
          if (receivedDateTime) {
            const msgDate = new Date(receivedDateTime);
            
            // Считаем только новые письма (после последней проверки)
            if (!lastCheckTime || msgDate > lastCheckTime) {
              newCount++;
            }
            
            // Обновляем время последнего письма
            if (!lastMessageTime || msgDate > lastMessageTime) {
              lastMessageTime = msgDate;
              lastMessageId = itemId;
            }
          }
        }
      }

      return { 
        count: newCount,
        lastMessageTime,
        lastMessageId
      };
    } catch (parseError: any) {
      console.error('[Exchange] [getNewEmailCount] Error parsing response:', parseError.message);
      return { count: 0 };
    }
  } catch (error: any) {
    const errorBody = error.body || '';
    if (errorBody.includes('ErrorNonExistentMailbox') || errorBody.includes('no mailbox')) {
      return { count: 0 };
    }
    console.error('[Exchange] [getNewEmailCount] Error:', error.message);
    return { count: 0 };
  }
};

// Проверка новых писем и отправка уведомлений
export const checkNewEmailsAndNotify = async (userId: string, userEmail: string): Promise<void> => {
  try {
    const lastCheck = emailCheckCache.get(userId);
    const lastCheckTime = lastCheck?.lastCheckTime;
    
    const emailInfo = await getNewEmailCount(userEmail, userId, undefined, lastCheckTime);
    
    if (!lastCheck) {
      if (emailInfo.lastMessageTime) {
        emailCheckCache.set(userId, {
          lastCheckTime: new Date(),
          lastMessageId: emailInfo.lastMessageId || null
        });
      }
      return;
    }
    
    if (emailInfo.count === 0) {
      if (emailInfo.lastMessageTime) {
        emailCheckCache.set(userId, {
          lastCheckTime: new Date(),
          lastMessageId: emailInfo.lastMessageId || null
        });
      }
      return;
    }
    
    
    const title = emailInfo.count === 1 ? 'Новое письмо' : `Новых писем: ${emailInfo.count}`;
    const message = emailInfo.count === 1 
      ? 'У вас новое письмо'
      : `У вас ${emailInfo.count} новых писем`;
    
    // Получаем ID системного отправителя
    const systemSenderId = process.env.SYSTEM_SENDER_ID || null;
    if (!systemSenderId) {
      console.warn(`[Exchange] [checkNewEmailsAndNotify] SYSTEM_SENDER_ID not configured, skipping notification creation`);
      return;
    }
    
    try {
      // Создаем уведомление в БД (это автоматически отправит его через Socket.IO и сохранит в БД)
      await NotificationController.create({
        type: 'EVENT',
        channels: ['IN_APP'],
        title,
        message,
        senderId: systemSenderId,
        receiverId: userId,
        action: {
          source: 'exchange',
          isEmailNotification: true,
          emailCount: emailInfo.count
        },
        priority: 'MEDIUM'
      });
      
    } catch (error: any) {
      console.error(`[Exchange] [checkNewEmailsAndNotify] ❌ Failed to create notification for user ${userId}:`, error.message);
    }
    
    if (emailInfo.lastMessageTime) {
      emailCheckCache.set(userId, {
        lastCheckTime: new Date(),
        lastMessageId: emailInfo.lastMessageId || null
      });
    }
    
  } catch (error: any) {
    console.error(`[Exchange] [checkNewEmailsAndNotify] Error checking emails for user ${userId}:`, error.message);
  }
};

// Получение email пользователя из LDAP или БД
export const getUserEmail = async (userId: string): Promise<string | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, login: true }
    });
    
    if (user?.email) {
      return user.email;
    }
    
    // Если email нет в БД, пытаемся получить из LDAP
    if (user?.login) {
      const { Client } = await import('ldapts');
      const client = new Client({
        url: process.env.LDAP_URL || '',
        timeout: 10000,
        connectTimeout: 5000,
        strictDN: false
      });
      
      try {
        const serviceUser = process.env.LDAP_SERVICE_USER || '';
        const servicePassword = process.env.LDAP_SERVICE_PASSWORD || '';
        if (!serviceUser || !servicePassword) {
          console.warn('[Exchange] [getUserEmail] LDAP service credentials not configured');
          return null;
        }
        
        await client.bind(serviceUser, servicePassword);
        const searchBase = 'OU=DNS Users,DC=partner,DC=ru';
        const escapedLogin = user.login.replace(/[\\*()]/g, '\\$&');
        const { searchEntries } = await client.search(searchBase, {
          scope: 'sub',
          filter: `(sAMAccountName=${escapedLogin})`,
          attributes: ['mail', 'userPrincipalName']
        });
        
        if (searchEntries && searchEntries.length > 0) {
          const entry = searchEntries[0];
          const email = entry.mail || entry.userPrincipalName;
          if (email) {
            await client.unbind();
            return email as string;
          }
        }
        
        await client.unbind();
      } catch (ldapError) {
        console.error('[Exchange] [getUserEmail] LDAP error:', ldapError);
      }
    }
    
    return null;
  } catch (error: any) {
    console.error('[Exchange] [getUserEmail] Error:', error.message);
    return null;
  }
};

// Получение пароля Exchange пользователя из UserSettings
// ВАЖНО: Пароль должен быть очищен из памяти после использования
export const getUserExchangePassword = async (userId: string, req?: any): Promise<string | null> => {
  let decryptedPassword: string | null = null;
  try {
    const passwordSetting = await prisma.userSettings.findUnique({
      where: {
        userId_parameter: {
          userId: userId,
          parameter: 'exchange.password'
        }
      }
    });
    
    if (!passwordSetting || !passwordSetting.value) {
      return null;
    }
    
    try {
      decryptedPassword = decrypt(passwordSetting.value);
      
      // Проверяем, нужно ли перешифровать (автоматическая миграция)
      if (needsReencryption(passwordSetting.value)) {
        // Асинхронно перешифровываем пароль новым ключом (не блокируем текущий запрос)
        prisma.userSettings.update({
          where: {
            userId_parameter: {
              userId: userId,
              parameter: 'exchange.password'
            }
          },
          data: {
            value: encrypt(decryptedPassword)
          }
        }).catch((err: any) => {
          console.error('[Exchange] [getUserExchangePassword] Failed to re-encrypt password:', err.message);
        });
      }
      
      return decryptedPassword;
    } catch (decryptError: any) {
      // Если пароль в старом формате, возвращаем null чтобы использовать Impersonation
      // Пароль будет автоматически обновлен при следующем логине
      if (decryptError.message && decryptError.message.includes('Legacy')) {
        console.warn('[Exchange] [getUserExchangePassword] Password in legacy format, will be updated on next login');
      } else {
        // Не логируем детали ошибки расшифровки для безопасности
        console.error('[Exchange] [getUserExchangePassword] Decryption failed (details hidden for security)');
      }
      return null;
    }
  } catch (error: any) {
    // Не логируем детали ошибки для безопасности
    console.error('[Exchange] [getUserExchangePassword] Error (details hidden for security)');
    return null;
  } finally {
    // Очищаем пароль из памяти (хотя в JavaScript это не гарантирует полную очистку)
    if (decryptedPassword) {
      decryptedPassword = null;
    }
  }
};

// Проверка, настроен ли Exchange
export const isExchangeConfigured = (): boolean => {
  const hasUsername = !!EXCHANGE_CONFIG.ewsUsername;
  const hasPassword = !!EXCHANGE_CONFIG.ewsPassword;
  const hasCredentials = hasUsername && hasPassword;
  const hasUrl = !!(EXCHANGE_CONFIG.ewsUrl || EXCHANGE_CONFIG.owaUrl);
  
  
  return hasCredentials && hasUrl;
};

// Получение списка помещений (комнат) из Exchange
export const getRooms = async (
  userEmail: string,
  userId?: string,
  req?: any
): Promise<Array<{ email: string; name: string }>> => {
  try {
    const ewsUrl = getEwsUrl();
    
    let ewsUsername = EXCHANGE_CONFIG.ewsUsername;
    let ewsPassword = EXCHANGE_CONFIG.ewsPassword;
    let ewsDomain = EXCHANGE_CONFIG.ewsDomain;
    let useImpersonation = true;
    let userPassword: string | null = null;
    
    if (userId) {
      try {
        userPassword = await getUserExchangePassword(userId, req);
        if (userPassword) {
          ewsUsername = userEmail;
          ewsPassword = userPassword;
          ewsDomain = '';
          useImpersonation = false;
        } else {
          useImpersonation = true;
        }
      } catch (passwordError: any) {
        useImpersonation = true;
      }
    }
    
    if (!ewsUsername || !ewsPassword) {
      throw new Error('EWS username and password are required');
    }
    
    let ntlmUsername = ewsUsername;
    let ntlmDomain = ewsDomain;
    
    if (!useImpersonation && userEmail.includes('@')) {
      ntlmUsername = userEmail;
      ntlmDomain = '';
    } else if (ntlmUsername.includes('@')) {
      ntlmUsername = ntlmUsername.split('@')[0];
      if (!ntlmDomain && ewsUsername.includes('@')) {
        const emailParts = ewsUsername.split('@');
        if (emailParts.length > 1) {
          const domainPart = emailParts[1].toLowerCase();
          if (domainPart === 'dns-shop.ru' || domainPart === 'partner.ru') {
            ntlmDomain = 'partner';
          } else if (domainPart.includes('.')) {
            ntlmDomain = domainPart.split('.')[0];
          }
        }
      }
    } else if (ntlmUsername.includes('\\')) {
      const parts = ntlmUsername.split('\\');
      ntlmDomain = parts[0];
      ntlmUsername = parts[1];
    }
    
    const impersonationHeader = useImpersonation ? `
    <t:ExchangeImpersonation>
      <t:ConnectingSID>
        <t:PrimarySmtpAddress>${userEmail.toLowerCase()}</t:PrimarySmtpAddress>
      </t:ConnectingSID>
    </t:ExchangeImpersonation>` : '';
    
    // Получаем список комнат через поиск пользователей типа "Room" в адресной книге
    // Используем ResolveNames для поиска всех пользователей, затем фильтруем по типу Room
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />${impersonationHeader}
  </soap:Header>
  <soap:Body>
    <m:ResolveNames ReturnFullContactData="true">
      <m:UnresolvedEntry>*</m:UnresolvedEntry>
    </m:ResolveNames>
  </soap:Body>
</soap:Envelope>`;

    let response;
    try {
      response = await makeEwsRequest(
        ewsUrl,
        soapEnvelope,
        'http://schemas.microsoft.com/exchange/services/2006/messages/ResolveNames',
        ntlmUsername,
        ewsPassword,
        ntlmDomain
      );
    } finally {
      if (userPassword) {
        ewsPassword = '';
        userPassword = null;
        ntlmUsername = '';
      }
    }

    if (response.statusCode !== 200) {
      console.error(`[Exchange] [getRooms] ❌ EWS request failed with status code ${response.statusCode}`);
      return [];
    }

    // Парсим ответ и получаем список всех пользователей, затем фильтруем комнаты
    const parsed = xmlParser.parse(response.body);
    const envelope = parsed['s:Envelope'] || parsed['soap:Envelope'] || parsed.Envelope;
    const body = envelope?.['s:Body'] || envelope?.['soap:Body'] || envelope?.Body;
    const resolveNamesResponse = body?.['m:ResolveNamesResponse'] || body?.ResolveNamesResponse;
    const responseMessages = resolveNamesResponse?.['m:ResponseMessages'] || resolveNamesResponse?.ResponseMessages;
    const resolveNamesResponseMessage = responseMessages?.['m:ResolveNamesResponseMessage'] || responseMessages?.ResolveNamesResponseMessage;
    
    const rooms: Array<{ email: string; name: string }> = [];
    
    if (resolveNamesResponseMessage) {
      const resolutionSet = resolveNamesResponseMessage?.['m:ResolutionSet'] || resolveNamesResponseMessage?.ResolutionSet;
      const resolutions = resolutionSet?.['t:Resolution'] || resolutionSet?.Resolution;
      
      if (resolutions) {
        const resolutionsArray = Array.isArray(resolutions) ? resolutions : [resolutions];
        
        resolutionsArray.forEach((resolution: any) => {
          const mailbox = resolution?.['t:Mailbox'] || resolution?.Mailbox;
          const contact = resolution?.['t:Contact'] || resolution?.Contact;
          
          if (mailbox) {
            const email = mailbox?.['t:EmailAddress'] || mailbox?.EmailAddress || '';
            const name = mailbox?.['t:Name'] || mailbox?.Name || email;
            const routingType = mailbox?.['t:RoutingType'] || mailbox?.RoutingType || '';
            
            // Проверяем, является ли это комнатой
            // Комнаты обычно имеют тип "Room" в MailboxType или в контакте
            const mailboxType = mailbox?.['t:MailboxType'] || mailbox?.MailboxType || '';
            const isRoom = mailboxType === 'Room' || 
                          (contact && (contact?.['t:DisplayName'] || contact?.DisplayName || '').toLowerCase().includes('room')) ||
                          (name && name.toLowerCase().includes('room')) ||
                          (email && email.toLowerCase().includes('room'));
            
            // Также проверяем через контакт, если есть
            if (contact) {
              const contactDisplayName = contact?.['t:DisplayName'] || contact?.DisplayName || '';
              const contactEmail = contact?.['t:EmailAddresses'] || contact?.EmailAddresses;
              
              // Если это комната, добавляем её
              if (isRoom && email) {
                rooms.push({ 
                  email: email, 
                  name: name || contactDisplayName || email 
                });
              }
            } else if (isRoom && email) {
              // Если контакта нет, но это комната по другим признакам
              rooms.push({ 
                email: email, 
                name: name || email 
              });
            }
          }
        });
      }
    }
    
    // Если через ResolveNames не получилось найти комнаты, пробуем альтернативный способ
    // - поиск через GetRoomLists (если настроены списки комнат)
    if (rooms.length === 0) {
      console.log('[Exchange] [getRooms] No rooms found via ResolveNames, trying GetRoomLists...');
      
      const getRoomListsSoap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />${impersonationHeader}
  </soap:Header>
  <soap:Body>
    <m:GetRoomLists />
  </soap:Body>
</soap:Envelope>`;

      try {
        const roomListsResponse = await makeEwsRequest(
          ewsUrl,
          getRoomListsSoap,
          'http://schemas.microsoft.com/exchange/services/2006/messages/GetRoomLists',
          ntlmUsername,
          ewsPassword,
          ntlmDomain
        );

        if (roomListsResponse.statusCode === 200) {
          const roomListsParsed = xmlParser.parse(roomListsResponse.body);
          const roomListsEnvelope = roomListsParsed['s:Envelope'] || roomListsParsed['soap:Envelope'] || roomListsParsed.Envelope;
          const roomListsBody = roomListsEnvelope?.['s:Body'] || roomListsEnvelope?.['soap:Body'] || roomListsEnvelope?.Body;
          const getRoomListsResponse = roomListsBody?.['m:GetRoomListsResponse'] || roomListsBody?.GetRoomListsResponse;
          const roomListsResponseMessages = getRoomListsResponse?.['m:ResponseMessages'] || getRoomListsResponse?.ResponseMessages;
          const getRoomListsResponseMessage = roomListsResponseMessages?.['m:GetRoomListsResponseMessage'] || roomListsResponseMessages?.GetRoomListsResponseMessage;
          
          const roomLists = getRoomListsResponseMessage?.['m:RoomLists'] || getRoomListsResponseMessage?.RoomLists;
          const addressLists = roomLists?.['t:AddressList'] || roomLists?.AddressList;
          
          if (addressLists) {
            const addressListArray = Array.isArray(addressLists) ? addressLists : [addressLists];
            
            for (const addressList of addressListArray) {
              const address = addressList?.['t:Address'] || addressList?.Address || '';
              
              if (address) {
                const getRoomsSoap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="${EXCHANGE_CONFIG.ewsVersion}" />${impersonationHeader}
  </soap:Header>
  <soap:Body>
    <m:GetRooms>
      <t:RoomList>
        <t:EmailAddress>${address}</t:EmailAddress>
      </t:RoomList>
    </m:GetRooms>
  </soap:Body>
</soap:Envelope>`;

                try {
                  const roomsResponse = await makeEwsRequest(
                    ewsUrl,
                    getRoomsSoap,
                    'http://schemas.microsoft.com/exchange/services/2006/messages/GetRooms',
                    ntlmUsername,
                    ewsPassword,
                    ntlmDomain
                  );

                  if (roomsResponse.statusCode === 200) {
                    const roomsParsed = xmlParser.parse(roomsResponse.body);
                    const roomsEnvelope = roomsParsed['s:Envelope'] || roomsParsed['soap:Envelope'] || roomsParsed.Envelope;
                    const roomsBody = roomsEnvelope?.['s:Body'] || roomsEnvelope?.['soap:Body'] || roomsEnvelope?.Body;
                    const getRoomsResponse = roomsBody?.['m:GetRoomsResponse'] || roomsBody?.GetRoomsResponse;
                    const roomsResponseMessages = getRoomsResponse?.['m:ResponseMessages'] || getRoomsResponse?.ResponseMessages;
                    const getRoomsResponseMessage = roomsResponseMessages?.['m:GetRoomsResponseMessage'] || roomsResponseMessages?.GetRoomsResponseMessage;
                    
                    const roomsList = getRoomsResponseMessage?.['m:Rooms'] || getRoomsResponseMessage?.Rooms;
                    const roomItems = roomsList?.['t:Room'] || roomsList?.Room;
                    
                    if (roomItems) {
                      const roomItemsArray = Array.isArray(roomItems) ? roomItems : [roomItems];
                      roomItemsArray.forEach((room: any) => {
                        const roomEmail = room?.['t:EmailAddress'] || room?.EmailAddress || '';
                        const roomName = room?.['t:Name'] || room?.Name || roomEmail;
                        if (roomEmail) {
                          rooms.push({ email: roomEmail, name: roomName });
                        }
                      });
                    }
                  }
                } catch (roomError) {
                  console.error(`[Exchange] [getRooms] Error getting rooms from list ${address}:`, roomError);
                }
              }
            }
          }
        }
      } catch (roomListsError) {
        console.error('[Exchange] [getRooms] Error getting room lists:', roomListsError);
      }
    }

    console.log(`[Exchange] [getRooms] Found ${rooms.length} rooms`);
    return rooms;
  } catch (error: any) {
    console.error('[Exchange] [getRooms] Error:', error.message);
    // Возвращаем пустой список при ошибке, чтобы не блокировать создание события
    return [];
  }
};

// Экспорт сервиса
export const exchangeService = {
  getCalendarEvents,
  getUserEmail,
  checkNewEmailsAndNotify,
  isConfigured: isExchangeConfigured
};

