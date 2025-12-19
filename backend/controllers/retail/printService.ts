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
  shouldPrintWobbler: z.boolean().optional().default(true),
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
    const { tokenAuth, auth } = await getAuthTokens(req);
    const { templateName, dateFrom, branchId, nomenclatures, ...printParams } = printRequestSchema.parse(req.body);

    if (nomenclatures.length === 0) {
      return res.status(400).json({ error: "Список номенклатур пуст" });
    }

    // Формируем и отправляем запрос на печать
    const pdfBuffer = await sendPrintRequest({
      ...printParams,
      templatesList: [{
        name: templateName,
        isMarkdown: false,
        nomenclatures: nomenclatures
      }]
    }, tokenAuth, auth);

    // Отправляем PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=price_tags_${new Date().toISOString()}.pdf`
    }).send(pdfBuffer);

  } catch (error) {
    handleError(error, res);
  }
};

// Вспомогательные функции
async function getTokens(login: string, password: string) {
  const response = await axios.post("http://ekb.sale.partner.ru/login", { login, password });
  const cookies = response.headers['set-cookie']?.reduce((acc, cookie) => {
    const [keyValue] = cookie.split(';');
    const [key, value] = keyValue.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  return {
    tokenAuth: cookies?.['.tokenAuth'],
    auth: cookies?.['.auth']
  };
}

async function getAuthTokens(req: Request) {
  return req.body.tokens || getTokens(
    process.env.WEB_BASE_LOGIN!,
    process.env.WEB_BASE_PASSWORD!
  );
}

async function sendPrintRequest(data: any, tokenAuth: string, auth: string) {
  const response = await axios.post(
    "http://ekb.sale.partner.ru/common/priceTagsPrinting/print",
    data,
    {
      headers: {
        "Content-Type": "application/json",
        "Cookie": `.tokenAuth=${tokenAuth}; .auth=${auth}`,
        "User-Agent": "Mozilla/5.0"
      },
      responseType: 'json'
    }
  );
  return Buffer.from(response.data.data[0].bytes, 'base64');
}

function handleError(error: unknown, res: Response) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: "Ошибка валидации",
      details: error.issues
    });
  }
  if (axios.isAxiosError(error)) {
    return res.status(500).json({
      error: "Ошибка печати",
      details: error.response?.data || error.message
    });
  }
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}