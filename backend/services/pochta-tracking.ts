import axios, { AxiosError } from 'axios';
import { XMLParser } from 'fast-xml-parser';

// API Почты России использует SOAP для отслеживания
// Единичный доступ: https://tracking.russianpost.ru/rtm34
// WSDL: https://tracking.russianpost.ru/rtm34?wsdl
const SOAP_ENDPOINT = 'https://tracking.russianpost.ru/rtm34';
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

interface PochtaTrackingCredentials {
  login?: string;
  password?: string;
}

function getCredentials(): PochtaTrackingCredentials {
  const login = process.env.POCHTA_TRACKING_LOGIN;
  const password = process.env.POCHTA_TRACKING_PASSWORD;
  
  if (!login || !password) {
    throw new Error('POCHTA_TRACKING_LOGIN and POCHTA_TRACKING_PASSWORD must be configured for SOAP API access');
  }
  
  return { login, password };
}

export interface PochtaTrackingEvent {
  date: string;
  index: string;
  description: string;
  operationParameters?: {
    operationType?: {
      id?: string;
      name?: string;
    };
    operationAttribute?: {
      id?: string;
      name?: string;
    };
  };
  addressParameters?: {
    destinationAddress?: {
      index?: string;
      description?: string;
    };
    operationAddress?: {
      index?: string;
      description?: string;
    };
  };
}

export interface PochtaTrackingResponse {
  trackNumber: string;
  barcode?: string;
  trackingEvents?: PochtaTrackingEvent[];
  error?: {
    code: string;
    description: string;
  };
}

/**
 * Получить информацию о трек-номере от Почты России
 * Использует публичный API или авторизованный доступ
 * @param trackNumber - Трек-номер отправления (например, 12345678901234)
 * @returns Информация об отправлении или null в случае ошибки
 */
export async function trackParcel(trackNumber: string): Promise<PochtaTrackingResponse | null> {
  if (!trackNumber?.trim()) {
    return null;
  }

  // Очищаем трек-номер от пробелов и лишних символов
  const cleanTrackNumber = trackNumber.trim().replace(/\s+/g, '');

  // Проверяем формат трек-номера (14 цифр для внутрироссийских или 13 символов для международных)
  // Внутрироссийский: 14 цифр (например, 12345678901234)
  // Международный: 13 символов буквенно-цифровых в формате S10 (например, RA123456788RU)
  const isDomestic = /^\d{14}$/.test(cleanTrackNumber);
  const isInternational = /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cleanTrackNumber);
  
  if (!isDomestic && !isInternational) {
    return {
      trackNumber: cleanTrackNumber,
      trackingEvents: [],
      error: {
        code: 'INVALID_FORMAT',
        description: 'Неверный формат трек-номера. Ожидается 14 цифр (внутрироссийский) или 13 символов (международный)',
      },
    };
  }

  try {
    const credentials = getCredentials();
    
    // Формируем SOAP запрос для метода getOperationHistory
    // Экранируем специальные символы в XML
    const escapeXml = (str: string): string => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:oper="http://russianpost.org/operationhistory" xmlns:data="http://russianpost.org/operationhistory/data" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
   <soap:Header/>
   <soap:Body>
      <oper:getOperationHistory>
         <data:OperationHistoryRequest>
            <data:Barcode>${escapeXml(cleanTrackNumber)}</data:Barcode>
            <data:MessageType>0</data:MessageType>
            <data:Language>RUS</data:Language>
         </data:OperationHistoryRequest>
         <data:AuthorizationHeader soapenv:mustUnderstand="1">
            <data:login>${escapeXml(credentials.login || '')}</data:login>
            <data:password>${escapeXml(credentials.password || '')}</data:password>
         </data:AuthorizationHeader>
      </oper:getOperationHistory>
   </soap:Body>
</soap:Envelope>`;

    // Отправляем SOAP запрос
    const response = await axios.post(
      SOAP_ENDPOINT,
      soapEnvelope,
      {
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': 'http://russianpost.org/operationhistory/getOperationHistory',
        },
        timeout: 30000, // 30 секунд таймаут
      }
    );
    
    // Парсим SOAP ответ
    const parsed = xmlParser.parse(response.data);
    
    // Извлекаем данные из SOAP структуры
    const envelope = parsed['soap:Envelope'] || parsed['S:Envelope'] || parsed.Envelope;
    if (!envelope) {
      console.error(`[PochtaTracking] No envelope found in SOAP response`);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'PARSE_ERROR',
          description: 'Не удалось обработать ответ от API Почты России.',
        },
      };
    }

    const body = envelope['soap:Body'] || envelope['S:Body'] || envelope.Body;
    if (!body) {
      console.error(`[PochtaTracking] No body found in SOAP envelope`);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'PARSE_ERROR',
          description: 'Не удалось обработать ответ от API Почты России.',
        },
      };
    }

    // Проверяем на ошибки авторизации
    const authFault = body['soap:Fault'] || body['S:Fault'] || body.Fault;
    if (authFault) {
      const faultString = authFault['soap:Reason']?.['soap:Text']?.['#text'] || 
                         authFault['faultstring'] || 
                         authFault['soap:Detail']?.AuthorizationFault?.Message ||
                         'Ошибка при обращении к API';
      console.error(`[PochtaTracking] SOAP Fault:`, faultString);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'SOAP_FAULT',
          description: faultString,
        },
      };
    }

    // Извлекаем ответ getOperationHistoryResponse
    const responseData = body['oper:getOperationHistoryResponse'] || 
                        body['ns7:getOperationHistoryResponse'] ||
                        body.getOperationHistoryResponse;
    
    if (!responseData) {
      console.error(`[PochtaTracking] No getOperationHistoryResponse found in body`);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'PARSE_ERROR',
          description: 'Не удалось найти данные в ответе API.',
        },
      };
    }

    const operationHistoryData = responseData['data:OperationHistoryData'] || 
                                 responseData['ns3:OperationHistoryData'] ||
                                 responseData.OperationHistoryData;

    if (!operationHistoryData) {
      console.error(`[PochtaTracking] No OperationHistoryData found`);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'NO_DATA',
          description: 'Информация об отправлении не найдена.',
        },
      };
    }

    // Извлекаем историю операций
    const historyRecords = operationHistoryData['data:historyRecord'] || 
                          operationHistoryData['ns3:historyRecord'] ||
                          operationHistoryData.historyRecord;

    if (!historyRecords) {
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
      };
    }

    // Нормализуем массив (может быть один элемент или массив)
    const records = Array.isArray(historyRecords) ? historyRecords : [historyRecords];

    // Преобразуем SOAP данные в наш формат
    const trackingEvents: PochtaTrackingEvent[] = records.map((record: any) => {
      const addressParams = record['data:AddressParameters'] || record['ns3:AddressParameters'] || record.AddressParameters || {};
      const operationParams = record['data:OperationParameters'] || record['ns3:OperationParameters'] || record.OperationParameters || {};
      
      const operationAddress = addressParams['data:OperationAddress'] || addressParams['ns3:OperationAddress'] || addressParams.OperationAddress || {};
      const destinationAddress = addressParams['data:DestinationAddress'] || addressParams['ns3:DestinationAddress'] || addressParams.DestinationAddress || {};
      
      const operType = operationParams['data:OperType'] || operationParams['ns3:OperType'] || operationParams.OperType || {};
      const operAttr = operationParams['data:OperAttr'] || operationParams['ns3:OperAttr'] || operationParams.OperAttr || {};
      const operDate = operationParams['data:OperDate'] || operationParams['ns3:OperDate'] || operationParams.OperDate || '';

      return {
        date: operDate,
        index: operationAddress['data:Index'] || operationAddress['ns3:Index'] || operationAddress.Index || '',
        description: operType['data:Name'] || operType['ns3:Name'] || operType.Name || 'Операция',
        operationParameters: {
          operationType: {
            id: operType['data:Id'] || operType['ns3:Id'] || operType.Id,
            name: operType['data:Name'] || operType['ns3:Name'] || operType.Name,
          },
          operationAttribute: {
            id: operAttr['data:Id'] || operAttr['ns3:Id'] || operAttr.Id,
            name: operAttr['data:Name'] || operAttr['ns3:Name'] || operAttr.Name,
          },
        },
        addressParameters: {
          operationAddress: {
            index: operationAddress['data:Index'] || operationAddress['ns3:Index'] || operationAddress.Index,
            description: operationAddress['data:Description'] || operationAddress['ns3:Description'] || operationAddress.Description,
          },
          destinationAddress: {
            index: destinationAddress['data:Index'] || destinationAddress['ns3:Index'] || destinationAddress.Index,
            description: destinationAddress['data:Description'] || destinationAddress['ns3:Description'] || destinationAddress.Description,
          },
        },
      };
    });

    return {
      trackNumber: cleanTrackNumber,
      trackingEvents,
    };
  } catch (error) {
    // Обработка ошибки отсутствия креденшалов
    if (error instanceof Error && error.message.includes('POCHTA_TRACKING_LOGIN')) {
      console.error(`[PochtaTracking] Missing credentials:`, error.message);
      return {
        trackNumber: cleanTrackNumber,
        trackingEvents: [],
        error: {
          code: 'MISSING_CREDENTIALS',
          description: 'Не настроены учетные данные для API Почты России. Установите переменные окружения POCHTA_TRACKING_LOGIN и POCHTA_TRACKING_PASSWORD.',
        },
      };
    }

    const axiosError = error as AxiosError;
    
    if (axiosError.response) {
      // Сервер вернул ошибку
      console.error(`[PochtaTracking] API error for track ${trackNumber}:`, {
        status: axiosError.response.status,
        statusText: axiosError.response.statusText,
        headers: axiosError.response.headers,
      });

      // Пытаемся распарсить SOAP Fault из ответа
      if (typeof axiosError.response.data === 'string' && (axiosError.response.data.includes('soap:Envelope') || axiosError.response.data.includes('Envelope'))) {
        try {
          const parsed = xmlParser.parse(axiosError.response.data);
          const envelope = parsed['soap:Envelope'] || parsed['S:Envelope'] || parsed.Envelope;
          const body = envelope?.['soap:Body'] || envelope?.['S:Body'] || envelope?.Body;
          const fault = body?.['soap:Fault'] || body?.['S:Fault'] || body?.Fault;
          
          if (fault) {
            const faultString = fault['soap:Reason']?.['soap:Text']?.['#text'] || 
                               fault['faultstring'] || 
                               fault['soap:Detail']?.OperationHistoryFault?.Message ||
                               'Ошибка при обращении к API';
            
            return {
              trackNumber: cleanTrackNumber,
              trackingEvents: [],
              error: {
                code: 'SOAP_FAULT',
                description: faultString,
              },
            };
          }
        } catch (parseError) {
          // Игнорируем ошибки парсинга SOAP fault
        }
      }
      
      // Если это 404 или данные не найдены
      if (axiosError.response.status === 404) {
        return {
          trackNumber: cleanTrackNumber,
          trackingEvents: [],
          error: {
            code: 'NOT_FOUND',
            description: 'Отправление с таким трек-номером не найдено в системе Почты России',
          },
        };
      }
    } else if (axiosError.request) {
      // Запрос был отправлен, но ответа не получено
      console.error(`[PochtaTracking] No response for track ${trackNumber}:`, axiosError.message);
    } else {
      // Ошибка при настройке запроса
      console.error(`[PochtaTracking] Request setup error for track ${trackNumber}:`, axiosError.message);
    }

    // Возвращаем базовую информацию даже при ошибке
    const errorDescription = axiosError.response?.status === 401 || axiosError.response?.status === 403
      ? 'Ошибка авторизации. Проверьте правильность логина и пароля в настройках POCHTA_TRACKING_LOGIN и POCHTA_TRACKING_PASSWORD.'
      : 'Не удалось получить информацию об отправлении. Проверьте трек-номер или настройки API.';

    return {
      trackNumber: cleanTrackNumber,
      trackingEvents: [],
      error: {
        code: 'API_ERROR',
        description: errorDescription,
      },
    };
  }
}

/**
 * Получить последний статус отправления
 * @param trackNumber - Трек-номер отправления
 * @returns Последний статус или null
 */
export async function getLastStatus(trackNumber: string): Promise<{
  status: string;
  date: string;
  location?: string;
} | null> {
  const trackingData = await trackParcel(trackNumber);
  
  if (!trackingData || !trackingData.trackingEvents || trackingData.trackingEvents.length === 0) {
    return null;
  }

  // Сортируем события по дате (последнее первым)
  const sortedEvents = [...trackingData.trackingEvents].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const lastEvent = sortedEvents[0];
  
  return {
    status: lastEvent.description || 'Статус неизвестен',
    date: lastEvent.date,
    location: lastEvent.addressParameters?.operationAddress?.description || 
             lastEvent.addressParameters?.destinationAddress?.description,
  };
}

