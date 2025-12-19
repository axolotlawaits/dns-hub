import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { z } from 'zod';
import { prisma } from '../../server.js';

dotenv.config();

// Схемы валидации
const authSchema = z.object({
  login: z.string().min(1, "Логин обязателен"),
  password: z.string().min(1, "Пароль обязателен")
});

const printRequestSchema = z.object({
  templateName: z.string().min(1, "Название шаблона обязательно"),
  dateFrom: z.string().datetime({ offset: true }).describe("Дата в формате ISO 8601"),
  branchId: z.string().uuid().optional(),
  priceTypeId: z.string().optional().default("9FE9D4AD02CFFBB647A7EE27BBD17DC8"),
  shouldPrintCountry: z.boolean().optional().default(true),
  discountPrc: z.string().optional().default("0"),
  shouldPrintWobbler: z.boolean().optional().default(false), // По умолчанию false, как в оригинальном запросе
  shouldPrintPrice: z.boolean().optional().default(true),
  nomenclatures: z.array(z.string()).min(1, "Список номенклатур обязателен")
});

const previewRequestSchema = z.object({
  dateFrom: z.string().datetime({ offset: true }),
  templateName: z.string().optional().default("StandardAutoprinter-Atol"),
  branchId: z.string().uuid().optional()
});

// Авторизация
export const authPrintService = async (req: Request, res: Response): Promise<any> => {
  try {
    const { login, password } = authSchema.parse(req.body);
    const tokens = await getTokens(login, password);
    res.json({ success: true, tokens });
  } catch (error) {
    handleError(error, res);
  }
};

// Предпросмотр ценников
export const previewPrintService = async (req: Request, res: Response): Promise<any> => {
  try {
    const { dateFrom, templateName, branchId } = previewRequestSchema.parse(req.body);

    // Получаем количество и информацию о товарах
    const count = await prisma.printService.count({
      where: {
        updatedAt: { gte: new Date(dateFrom) },
        ...(branchId && { branchId })
      }
    });

    // Получаем примеры товаров для предпросмотра (первые 5)
    const sampleItems = await prisma.printService.findMany({
      where: {
        updatedAt: { gte: new Date(dateFrom) },
        ...(branchId && { branchId })
      },
      select: {
        id: true,
        branchId: true,
        tovarName: true,
        tovarCode: true,
        price: true,
        createdAt: true,
        updatedAt: true,
        brand: true,
        tovarId: true,
        format: true,
        branch: true // Если нужно включить связанные данные из Branch
      },
      orderBy: {
        updatedAt: 'desc'
      },

    });

    res.json({
      success: true,
      count,
      template: templateName,
      sampleItems,
      dateFrom: new Date(dateFrom).toISOString()
    });
  } catch (error) {
    handleError(error, res);
  }
};

// Печать ценников
export const printFromDate = async (req: Request, res: Response): Promise<any> => {
  try {
    let { tokenAuth, auth } = await getAuthTokens(req);
    const { templateName, dateFrom, branchId, nomenclatures, ...printParams } = printRequestSchema.parse(req.body);

    console.log('Print request:', {
      templateName,
      dateFrom,
      branchId,
      nomenclaturesCount: nomenclatures.length,
      printParams,
      hasTokenAuth: !!tokenAuth,
      hasAuth: !!auth
    });

    if (nomenclatures.length === 0) {
      return res.status(400).json({ error: "Список номенклатур пуст" });
    }

    // Если токены не переданы, получаем новые
    if (!tokenAuth || !auth) {
      if (process.env.WEB_BASE_LOGIN && process.env.WEB_BASE_PASSWORD) {
        console.log('Токены отсутствуют, получаем новые...');
        const newTokens = await getTokens(
          process.env.WEB_BASE_LOGIN,
          process.env.WEB_BASE_PASSWORD
        );
        tokenAuth = newTokens.tokenAuth;
        auth = newTokens.auth;
      } else {
        return res.status(401).json({ 
          error: "Ошибка аутентификации",
          message: "Токены авторизации отсутствуют. Необходимо авторизоваться в системе WEB База."
        });
      }
    }

    // Формируем и отправляем запрос на печать
    // Убеждаемся, что номенклатуры в правильном формате (с префиксом 0x если нужно)
    const formattedNomenclatures = nomenclatures.map(nom => {
      // Если номенклатура уже начинается с 0x, оставляем как есть
      // Иначе добавляем префикс 0x
      if (typeof nom === 'string' && nom.startsWith('0x')) {
        return nom;
      }
      // Если это обычный ID, добавляем префикс 0x
      return `0x${nom}`;
    });
    
    const requestData = {
      ...printParams,
      templatesList: [{
        name: templateName,
        isMarkdown: false,
        nomenclatures: formattedNomenclatures
      }]
    };

    console.log('Sending print request to external API:', {
      url: "https://ural.sale.dns-shop.ru/common/priceTagsPrinting/print",
      templateName,
      nomenclaturesCount: formattedNomenclatures.length,
      originalNomenclatures: nomenclatures,
      formattedNomenclatures: formattedNomenclatures,
      fullRequestData: JSON.stringify(requestData, null, 2)
    });

    const pdfBuffer = await sendPrintRequest(requestData, tokenAuth, auth);

    console.log('Print request successful, PDF size:', pdfBuffer.length);

    // Отправляем PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=price_tags_${new Date().toISOString()}.pdf`
    }).send(pdfBuffer);

  } catch (error) {
    console.error('Error in printFromDate:', error);
    handleError(error, res);
  }
};

// Вспомогательные функции
async function getTokens(login: string, password: string) {
  console.log('Getting tokens for login:', login);
  const response = await axios.post("https://ural.sale.dns-shop.ru/login", { login, password });
  
  console.log('Login response status:', response.status);
  console.log('Set-Cookie headers:', response.headers['set-cookie']);
  
  const cookies: Record<string, string> = {};
  
  if (response.headers['set-cookie']) {
    // Обрабатываем cookies в обратном порядке, чтобы последние (с domain) имели приоритет
    const cookieArray = [...response.headers['set-cookie']].reverse();
    
    for (const cookie of cookieArray) {
      // Убираем пробелы и парсим cookie
      const trimmedCookie = cookie.trim();
      const [keyValue] = trimmedCookie.split(';');
      const equalIndex = keyValue.indexOf('=');
      
      if (equalIndex > 0) {
        const key = keyValue.substring(0, equalIndex).trim();
        const value = keyValue.substring(equalIndex + 1).trim();
        
        // Пропускаем пустые значения (удаленные cookies с expires=Thu, 01 Jan 1970)
        if (value && value !== '') {
          // Берем последнее значение (последние cookies обычно правильные)
          if (!cookies[key]) {
            cookies[key] = value;
            console.log(`Parsed cookie: ${key} = ${value.substring(0, 20)}...`);
          }
        } else {
          console.log(`Skipping empty cookie: ${key}`);
        }
      }
    }
  }

  const tokens = {
    tokenAuth: cookies['.tokenAuth'] || cookies['tokenAuth'],
    auth: cookies['.auth'] || cookies['auth']
  };

  console.log('Extracted tokens:', {
    hasTokenAuth: !!tokens.tokenAuth,
    hasAuth: !!tokens.auth,
    tokenAuthLength: tokens.tokenAuth?.length,
    authLength: tokens.auth?.length,
    allCookies: Object.keys(cookies)
  });

  if (!tokens.tokenAuth || !tokens.auth) {
    throw new Error(`Не удалось получить токены авторизации. Найдены cookies: ${Object.keys(cookies).join(', ')}`);
  }

  return tokens;
}

async function getAuthTokens(req: Request) {
  // Проверяем, переданы ли токены в запросе
  if (req.body.tokens && req.body.tokens.tokenAuth && req.body.tokens.auth) {
    console.log('Using tokens from request:', {
      hasTokenAuth: !!req.body.tokens.tokenAuth,
      hasAuth: !!req.body.tokens.auth,
      tokenAuthLength: req.body.tokens.tokenAuth?.length,
      authLength: req.body.tokens.auth?.length,
      tokenAuthPreview: req.body.tokens.tokenAuth?.substring(0, 20),
      authPreview: req.body.tokens.auth?.substring(0, 20)
    });
    
    // Проверяем, что токены не пустые
    if (!req.body.tokens.tokenAuth || !req.body.tokens.auth) {
      console.warn('Tokens are empty, getting new ones...');
      if (process.env.WEB_BASE_LOGIN && process.env.WEB_BASE_PASSWORD) {
        return getTokens(
          process.env.WEB_BASE_LOGIN,
          process.env.WEB_BASE_PASSWORD
        );
      }
      throw new Error('Токены пустые и нет учетных данных для получения новых');
    }
    
    return req.body.tokens;
  }

  // Если токены не переданы, получаем новые
  console.log('Getting new tokens from login');
  if (!process.env.WEB_BASE_LOGIN || !process.env.WEB_BASE_PASSWORD) {
    throw new Error('WEB_BASE_LOGIN и WEB_BASE_PASSWORD должны быть установлены в переменных окружения');
  }

  return getTokens(
    process.env.WEB_BASE_LOGIN,
    process.env.WEB_BASE_PASSWORD
  );
}

function processPrintResponse(responseData: any): Buffer {
  // Проверяем поле code в ответе (0 или 1 = успех, другие = ошибка)
  if ('code' in responseData) {
    const apiCode = responseData.code;
    const apiMessage = responseData.message || 'Неизвестная ошибка';
    
    console.log('API response code check:', {
      code: apiCode,
      message: apiMessage,
      fullResponse: JSON.stringify(responseData, null, 2)
    });
    
    // code 0 или 1 означает успех
    if (apiCode !== 0 && apiCode !== 1) {
      console.error('API returned error code:', apiCode, 'Message:', apiMessage);
      console.error('Full error response:', JSON.stringify(responseData, null, 2));
      throw new Error(`Ошибка API: ${apiMessage}${apiCode === 2 ? ' (код ошибки: 2). Возможно, проблема с данными запроса или шаблоном.' : ''}`);
    }
  }

  // Проверяем наличие поля data
  if (!responseData.data) {
    console.error('Response data structure:', JSON.stringify(responseData, null, 2));
    throw new Error('Неверный формат ответа от сервера печати. Отсутствует поле "data".');
  }

  // Проверяем, что data - массив
  if (!Array.isArray(responseData.data)) {
    console.error('Response data.data is not an array:', typeof responseData.data, responseData.data);
    throw new Error(`Неверный формат ответа от сервера печати. Поле "data" должно быть массивом, получен: ${typeof responseData.data}`);
  }

  // Проверяем, что массив не пустой
  if (responseData.data.length === 0) {
    console.error('Response data.data is empty array');
    throw new Error('Неверный формат ответа от сервера печати. Массив "data" пуст.');
  }

  // Проверяем наличие bytes в первом элементе
  if (!responseData.data[0] || typeof responseData.data[0] !== 'object') {
    console.error('Response data.data[0] structure:', responseData.data[0]);
    throw new Error('Неверный формат ответа от сервера печати. Первый элемент массива "data" не является объектом.');
  }

  if (!responseData.data[0].bytes) {
    console.error('Response data.data[0] structure:', Object.keys(responseData.data[0]));
    throw new Error('Отсутствуют данные для печати в ответе сервера. Поле "bytes" не найдено.');
  }

  if (typeof responseData.data[0].bytes !== 'string') {
    console.error('Response data.data[0].bytes type:', typeof responseData.data[0].bytes);
    throw new Error(`Неверный формат данных для печати. Поле "bytes" должно быть строкой, получен: ${typeof responseData.data[0].bytes}`);
  }

  try {
    console.log('Successfully decoded PDF, size:', responseData.data[0].bytes.length);
    return Buffer.from(responseData.data[0].bytes, 'base64');
  } catch (error) {
    console.error('Error decoding base64:', error);
    throw new Error('Ошибка декодирования данных для печати. Данные не являются валидным base64.');
  }
}

async function sendPrintRequest(data: any, tokenAuth: string, auth: string, retryWithNewTokens = false): Promise<Buffer> {
  try {
    // Проверяем, что токены не пустые
    if (!tokenAuth || !auth) {
      throw new Error('Токены авторизации пустые');
    }

    // Формируем Cookie header - используем формат как в браузере
    // Добавляем дополнительные cookies, которые есть в оригинальном запросе
    const cookieHeader = `swbundles=false; swmultiaction=false; swdeliverydiscount=false; swdiscountandoffer=false; swp=false; sgs=0; .tokenAuth=${tokenAuth}; .auth=${auth}`;
    
    console.log('Sending print request with tokens:', {
      hasTokenAuth: !!tokenAuth,
      hasAuth: !!auth,
      tokenAuthLength: tokenAuth?.length,
      authLength: auth?.length,
      tokenAuthPreview: tokenAuth.substring(0, 50) + '...',
      authPreview: auth.substring(0, 50) + '...',
      cookieHeader: cookieHeader.substring(0, 150) + '...',
      retryWithNewTokens,
      fullTokenAuth: tokenAuth,
      fullAuth: auth
    });

    // Используем домен ural.sale.dns-shop.ru
    // Если будет редирект, axios автоматически последует ему
    const printUrl = "https://ural.sale.dns-shop.ru/common/priceTagsPrinting/print";
    
    console.log('Full request data being sent:', JSON.stringify(data, null, 2));
    
    // Создаем axios instance с поддержкой cookies
    const axiosInstance = axios.create({
      withCredentials: false, // Не используем автоматическую поддержку cookies, передаем вручную
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });
    
    const response = await axiosInstance.post(
      printUrl,
      data,
      {
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookieHeader,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Accept-Encoding": "gzip, deflate, br, zstd",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          "Connection": "keep-alive",
          "Host": "ural.sale.dns-shop.ru",
          "Origin": "https://ural.sale.dns-shop.ru",
          "Referer": "https://ural.sale.dns-shop.ru/consultant/print-pricetags",
          "Sec-CH-UA": '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
          "Sec-CH-UA-Mobile": "?0",
          "Sec-CH-UA-Platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "X-Requested-With": "XMLHttpRequest"
        },
        responseType: 'json'
      }
    );

    console.log('Response status:', response.status);
    console.log('Response statusText:', response.statusText);
    console.log('Response headers:', JSON.stringify(response.headers, null, 2));
    console.log('Response data type:', typeof response.data);
    console.log('Response data preview:', typeof response.data === 'string' 
      ? response.data.substring(0, 200) 
      : JSON.stringify(response.data).substring(0, 200));

    // Проверяем, не вернул ли сервер HTML страницу входа (признак недействительных токенов)
    const responseData = response.data;
    const contentType = response.headers['content-type'] || '';
    const isHtmlResponse = contentType.includes('text/html');
    
    console.log('Checking response type:', {
      contentType,
      isHtmlResponse,
      responseDataType: typeof responseData,
      responseStatus: response.status
    });
    
    // Проверяем только если это действительно HTML ответ (по content-type)
    if (isHtmlResponse) {
      const responseString = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
      
      if (responseString.includes('<!DOCTYPE html>') || 
          responseString.includes('<html') ||
          responseString.includes('Выполните вход') || 
          responseString.includes('Введите имя пользователя и пароль')) {
        
        console.log('HTML login page detected, tokens are invalid');
        
      // Если это не повторная попытка, пробуем получить новые токены и повторить запрос
      if (!retryWithNewTokens) {
        console.log('Токены недействительны, получаем новые токены...');
        
        // Пробуем получить токены из переменных окружения
        if (process.env.WEB_BASE_LOGIN && process.env.WEB_BASE_PASSWORD) {
          const newTokens = await getTokens(
            process.env.WEB_BASE_LOGIN,
            process.env.WEB_BASE_PASSWORD
          );
          
          if (newTokens.tokenAuth && newTokens.auth) {
            console.log('Повторяем запрос с новыми токенами...');
            return sendPrintRequest(data, newTokens.tokenAuth, newTokens.auth, true);
          }
        }
        
        // Если не удалось получить новые токены, выбрасываем ошибку
        throw new Error('Токены авторизации недействительны или истекли. Необходимо повторно авторизоваться в системе WEB База через интерфейс.');
      } else {
        // Если это уже повторная попытка и токены все еще недействительны
        throw new Error('Токены авторизации недействительны даже после обновления. Необходимо повторно авторизоваться в системе WEB База через интерфейс.');
      }
      }
    }

    // Проверяем статус ответа (200, 201, 212 - валидные статусы для этого API)
    // Если это редирект, axios должен был следовать ему автоматически
    if (response.status >= 300 && response.status < 400) {
      // Если axios не последовал редиректу, пробуем сделать запрос на новый URL вручную
      const location = response.headers.location;
      if (location) {
        console.log(`Redirect detected to: ${location}, making request to new URL...`);
        const redirectResponse = await axios.post(
          location.startsWith('http') ? location : `https://${location}`,
          data,
          {
            headers: {
              "Content-Type": "application/json",
              "Cookie": cookieHeader,
              "User-Agent": "Mozilla/5.0",
              "Accept": "application/json"
            },
            responseType: 'json',
            validateStatus: (status) => status < 500
          }
        );
        // Используем ответ от редиректа
        return processPrintResponse(redirectResponse.data);
      }
    }

    if (response.status !== 200 && response.status !== 201 && response.status !== 212) {
      console.error('Unexpected response status:', response.status);
      console.error('Response data:', responseData);
      throw new Error(`Сервер вернул статус ${response.status}. Проверьте логи для деталей.`);
    }

    // Проверяем структуру ответа
    if (!responseData) {
      console.error('Response data is null or undefined');
      throw new Error('Сервер вернул пустой ответ.');
    }

    // Если ответ - строка (HTML), это ошибка авторизации
    if (typeof responseData === 'string') {
      console.error('Server returned HTML instead of JSON:', responseData.substring(0, 500));
      throw new Error('Сервер вернул HTML страницу вместо данных. Токены авторизации недействительны.');
    }

    // Проверяем, что это объект
    if (typeof responseData !== 'object') {
      console.error('Response data is not an object:', typeof responseData, responseData);
      throw new Error(`Неверный формат ответа от сервера печати. Ожидался объект, получен: ${typeof responseData}`);
    }

    return processPrintResponse(responseData);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const responseData = error.response?.data;
      const responseString = typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {});
      
      // Проверяем, не является ли ответ HTML страницей входа
      if (responseString.includes('<!DOCTYPE html>') || 
          responseString.includes('Выполните вход') || 
          responseString.includes('Введите имя пользователя и пароль')) {
        throw new Error('Токены авторизации недействительны или истекли. Необходимо повторно авторизоваться в системе WEB База.');
      }
      
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Ошибка при запросе к серверу печати: ${errorMessage}`);
    }
    throw error;
  }
}

function handleError(error: unknown, res: Response) {
  console.error('Print service error:', error);
  
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: "Ошибка валидации",
      details: error.issues
    });
  }
  
  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
    const errorDetails = error.response?.data || {};
    
    return res.status(statusCode).json({
      error: "Ошибка печати",
      message: errorMessage,
      details: errorDetails
    });
  }
  
  // Обработка обычных ошибок (Error)
  if (error instanceof Error) {
    return res.status(500).json({
      error: "Ошибка печати",
      message: error.message
    });
  }
  
  res.status(500).json({ 
    error: "Внутренняя ошибка сервера",
    message: String(error)
  });
}