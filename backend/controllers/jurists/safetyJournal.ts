import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { prisma } from '../../server.js';
import { decodeRussianFileName } from '../../utils/format.js';
import { findUsersByResponsiblesBatch } from '../../utils/findUserByResponsible.js';
import { withDbRetry, isP1001 } from '../../utils/dbRetry.js';

const JOURNALS_API_URL = process.env.JOURNALS_API_URL

// Функция для получения токена из заголовков
const getAuthToken = (req: Request): string | null => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    console.error('[SafetyJournal] No authorization header found in request');
    return null;
  }
  return authHeader.split(' ')[1] || null;
};

// Функция для создания заголовков с авторизацией
const createAuthHeaders = (token: string | null) => {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

// Функция для проверки доступа к изменению статуса при загрузке файлов
const checkFileUploadStatusChangeAccess = async (userId: string, positionName: string, groupName: string, newStatus: string): Promise<boolean> => {
  try {
    // Разрешаем изменение статуса на "under_review" для всех пользователей при загрузке файлов
    if (newStatus === 'under_review') {
      return true;
    }
    
    // Для других статусов используем обычную проверку прав
    return await checkSafetyJournalAccess(userId, positionName, groupName);
  } catch (error) {
    console.error('[SafetyJournal] Error checking file upload status change access:', error);
    return false;
  }
};

// Функция для проверки доступа к jurists/safety (только для управления статусами)
const checkSafetyJournalAccess = async (userId: string, positionName: string, groupName: string): Promise<boolean> => {
  try {
    // Сначала проверяем роль пользователя - SUPERVISOR имеет полный доступ
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'SUPERVISOR') {
      return true;
    }
    
    // Ищем инструмент jurists/safety
    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      return false;
    }

    // Проверяем доступ на уровне пользователя - только FULL доступ
    const userAccess = await prisma.userToolAccess.findFirst({
      where: {
        userId: userId,
        toolId: safetyTool.id,
        accessLevel: 'FULL' // Только FULL доступ для управления статусами
      }
    });

    if (userAccess) {
      return true;
    }

    // Проверяем доступ на уровне должности - только FULL доступ
    const position = await prisma.position.findFirst({
      where: { name: positionName }
    });

    if (position) {
      const positionAccess = await prisma.positionToolAccess.findFirst({
        where: {
          positionId: position.uuid,
          toolId: safetyTool.id,
          accessLevel: 'FULL' // Только FULL доступ для управления статусами
        }
      });

      if (positionAccess) {
        return true;
      }
    }

    // Проверяем доступ на уровне группы - только FULL доступ
    if (groupName) {
      const group = await prisma.group.findFirst({
        where: { name: groupName }
      });

      if (group) {
        const groupAccess = await prisma.groupToolAccess.findFirst({
          where: {
            groupId: group.uuid,
            toolId: safetyTool.id,
            accessLevel: 'FULL' // Только FULL доступ для управления статусами
          }
        });

        if (groupAccess) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[SafetyJournal] Error checking safety journal access:', error);
    return false;
  }
};

// Получение информации о текущем пользователе
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).token;
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем информацию о филиале пользователя
    const branch = await prisma.branch.findFirst({
      where: { uuid: user.branch }
    });

    // Получаем статус пользователя из UserData
    const userData = await prisma.userData.findFirst({
      where: { email: user.email }
    });

    const userInfo = {
      userId: user.id,
      userName: user.name,
      userCode: user.login || '',
      email: user.email || null,
      positionName: user.position || '',
      positionId: user.position || '',
      branchId: user.branch || '',
      branchName: branch?.name || '',
      phoneNumber: null,
      counterpartyId: '',
      isManager: false,
      status: userData?.status || 'active'
    };

    res.json(userInfo);
  } catch (error) {
    console.error('[SafetyJournal] Error getting current user:', error);
    res.status(500).json({ message: 'Ошибка получения информации о пользователе' });
  }
};

// Получение списка филиалов с журналами (только для текущего пользователя)
export const getBranchesWithJournals = async (req: Request, res: Response) => {
  try {
    const { userId, positionName, groupName } = (req as any).token;
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    // Проверяем доступ к jurists/safety (для информации, но не блокируем)
    const hasFullAccess = await checkSafetyJournalAccess(userId, positionName, groupName);
    
    // Получаем филиалы из внешнего API
    const branchesResponse = await axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
      headers: createAuthHeaders(token)
    });

    // Получаем все филиалы из локальной БД для дополнительной информации
    const localBranches = await prisma.branch.findMany();
    const localBranchesMap = new Map(localBranches.map((branch: any) => [branch.uuid, branch]));

    // Объединяем данные из внешнего API с локальными данными
    const branchesWithJournals = await Promise.all(
      branchesResponse.data.branches.map(async (apiBranch: any) => {
        const localBranch = localBranchesMap.get(apiBranch.branch_id);
        
        // Обрабатываем журналы с файлами из API
        const journalsWithFilesCount = apiBranch.journals.map((journal: any) => {
          const isCurrent = isJournalCurrent(journal);
          const activeFilesCount = journal.files ? journal.files.filter((f: any) => !f.is_deleted).length : 0;
          
          return {
            ...journal,
            journal_type: journal.journal_type,
            files_count: activeFilesCount,
            is_current: isCurrent, // Флаг актуальности журнала
            // Используем id как branch_journal_id для загрузки файлов
            branch_journal_id: journal.id
          };
        });

        return {
          ...apiBranch,
          branch_address: localBranch?.address || apiBranch.branch_address || '',
          city_name: localBranch?.city || apiBranch.city_name || '',
          journals: journalsWithFilesCount
        };
      })
    );

    res.json({ 
      branches: branchesWithJournals,
      hasFullAccess: hasFullAccess // Добавляем информацию о доступе
    });
  } catch (error: any) {
    console.error('[SafetyJournal] Error getting branches with journals:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
    
    // Обработка различных типов ошибок подключения
    const isConnectionError = 
      error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ETIMEDOUT') ||
      error.message?.includes('timeout') ||
      (error.response?.status >= 500 && error.response?.status < 600);
    
    if (isConnectionError) {
      return res.json({ 
        branches: [],
        hasFullAccess: false,
        error: 'Внешний API недоступен или не отвечает. Попробуйте позже.',
        apiUnavailable: true,
        errorCode: error.code || 'CONNECTION_ERROR'
      });
    }
    
    // Ошибки авторизации
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(error.response.status).json({ 
        message: 'Ошибка авторизации при обращении к внешнему API',
        error: error.response.data
      });
    }
    
    // Другие ошибки
    res.status(500).json({ 
      message: 'Ошибка получения филиалов с журналами',
      error: error.message,
      errorCode: error.code
    });
  }
};

// Функция для получения количества файлов журнала
async function getJournalFilesCount(journalId: string, token: string): Promise<number> {
  try {
    return 0;
  } catch (error) {
    console.error(`[SafetyJournal] Error getting files count for journal ${journalId}:`, error);
    return 0;
  }
}

// Функция для получения списка файлов журнала
async function getJournalFiles(journalId: string, token: string): Promise<any[]> {
  try {
    const endpoints = [
      `${JOURNALS_API_URL}/files/?branch_journal_id=${journalId}`,
      `${JOURNALS_API_URL}/files/?journal_id=${journalId}`,
      `${JOURNALS_API_URL}/journals/${journalId}/files`,
      `${JOURNALS_API_URL}/branch_journals/${journalId}/files`,
      `${JOURNALS_API_URL}/files/`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        return response.data.files || response.data || [];
      } catch (endpointError: any) {
        // Продолжаем попытки с другими эндпоинтами
      }
    }
    
    // Если все эндпоинты не сработали, возвращаем пустой массив
    return [];
  } catch (error: any) {
    console.error(`[SafetyJournal] Error getting files for journal ${journalId}:`, error.response?.data || error.message);
    return [];
  }
}

// Функция для проверки актуальности журнала в текущем периоде
function isJournalCurrent(journal: any): boolean {
  const now = new Date();
  const periodStart = new Date(journal.period_start);
  const periodEnd = new Date(journal.period_end);
  
  // Журнал актуален, если текущая дата находится в периоде журнала
  return now >= periodStart && now <= periodEnd;
}

// Загрузка файла
export const uploadFile = async (req: Request, res: Response) => {
  try {
    const { branchJournalId } = req.body;
    const file = req.file;

    // Исправляем кодировку имени файла
    const correctedFileName = decodeRussianFileName(file?.originalname || '');

    if (!file) {
      return res.status(400).json({ message: 'Файл не предоставлен' });
    }

    if (!branchJournalId) {
      return res.status(400).json({ message: 'ID журнала филиала не предоставлен' });
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournal] JOURNALS_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // Проверяем валидность файла
    if (!file.buffer || file.buffer.length === 0) {
      console.error('[SafetyJournal] File buffer is empty or invalid:', {
        bufferExists: !!file.buffer,
        bufferLength: file.buffer?.length,
        fileName: file.originalname
      });
      return res.status(400).json({ message: 'Файл поврежден или пуст' });
    }

    if (file.size !== file.buffer.length) {
      // File size mismatch - continue processing
    }

    // Специальная проверка для PDF файлов
    if (file.mimetype === 'application/pdf' || (correctedFileName && correctedFileName.toLowerCase().endsWith('.pdf'))) {
      // Проверяем PDF заголовок
      const pdfHeader = file.buffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        return res.status(400).json({ message: 'Некорректный PDF файл' });
      }
    }


    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('branchJournalId', branchJournalId);
    
    try {
      formData.append('file', file.buffer, {
        filename: correctedFileName, // Используем исправленное имя файла
        contentType: file.mimetype
      });
    } catch (formDataError: any) {
      console.error('[SafetyJournal] Error creating FormData:', formDataError);
      return res.status(500).json({ 
        message: 'Ошибка при подготовке файла для загрузки',
        details: formDataError.message
      });
    }

    const url = `${JOURNALS_API_URL}/files/`;


    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      timeout: 90000, // 90 секунд таймаут для больших файлов // 30 секунд таймаут
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024 // 50MB
    });


    res.json(response.data);
  } catch (error: any) {
    console.error('[SafetyJournal] Error uploading file:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });

    if (error.response) {
      console.error('[SafetyJournal] External API error:', error.response.status, error.response.data);
      res.status(error.response.status).json({
        message: 'Ошибка внешнего API',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.code === 'ECONNABORTED') {
      console.error('[SafetyJournal] Request timeout');
      res.status(408).json({ message: 'Превышено время ожидания загрузки файла' });
    } else {
      console.error('[SafetyJournal] Network or other error:', error.message);
      res.status(500).json({ 
        message: 'Ошибка загрузки файла',
        details: error.message
      });
    }
  }
};

// Получение метаданных файла
export const getFileMetadata = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournal] JOURNALS_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    const response = await axios.get(`${JOURNALS_API_URL}/files/${fileId}`, {
      headers: createAuthHeaders(token),
      timeout: 10000 // 10 секунд таймаут
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[SafetyJournal] Error getting file metadata:', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: 'Ошибка получения метаданных файла' });
    }
  }
};


// Удаление файла
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournal] JOURNALS_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const { userId, positionName, groupName } = (req as any).token;

    // Удаление файлов доступно всем пользователям (не требует проверки прав)

    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    const response = await axios.delete(`${JOURNALS_API_URL}/files/${fileId}`, {
      headers: createAuthHeaders(token)
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('[SafetyJournal] Error deleting file:', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: 'Ошибка удаления файла' });
    }
  }
};

// Тестовый endpoint для проверки структуры данных от внешнего API
export const testExternalApi = async (req: Request, res: Response) => {
  try {
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    // Получаем данные от внешнего API
    const branchesResponse = await axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
      headers: createAuthHeaders(token),
      timeout: 10000 // 10 секунд таймаут
    });
    
    // Возвращаем первые несколько журналов для анализа
    const sampleJournals = branchesResponse.data.branches
      .flatMap((branch: any) => branch.journals)
      .slice(0, 3)
      .map((journal: any) => ({
        journal_id: journal.journal_id,
        branch_journal_id: journal.branch_journal_id,
        journal_title: journal.journal_title,
        allKeys: Object.keys(journal),
        fullJournal: journal
      }));
    
    res.json({ 
      message: 'Данные от внешнего API',
      sampleJournals,
      totalBranches: branchesResponse.data.branches.length,
      totalJournals: branchesResponse.data.branches.reduce((sum: number, branch: any) => sum + branch.journals.length, 0)
    });
  } catch (error: any) {
    console.error('[SafetyJournal] Error testing external API:', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: 'Ошибка тестирования внешнего API' });
    }
  }
};

// Получение списка файлов для журнала
export const getJournalFilesList = async (req: Request, res: Response) => {
  try {
    const { journalId } = req.params;
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    if (!journalId) {
      return res.status(400).json({ message: 'ID журнала не предоставлен' });
    }
    
    const files = await getJournalFiles(journalId, token);
    res.json({ files });
  } catch (error: any) {
    console.error('[SafetyJournal] Error getting journal files:', error);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ message: 'Ошибка получения файлов журнала' });
    }
  }
};

// Просмотр файла
export const viewFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournal] JOURNALS_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    const fileUrl = `${JOURNALS_API_URL}/files/${fileId}/view`;
    
    // ИСПРАВЛЕНО: Убран лишний тестовый запрос - сразу получаем файл как stream
    // Это ускоряет загрузку файлов в 2 раза
    const response = await axios.get(fileUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'stream',
      timeout: 90000 // 90 секунд таймаут для больших файлов и медленных соединений
    });
    
    // Устанавливаем заголовки для просмотра файла
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/octet-stream',
      'Content-Disposition': response.headers['content-disposition'] || 'inline',
      'Content-Length': response.headers['content-length']
    });
    
    response.data.pipe(res);
  } catch (error: any) {
    console.error('[SafetyJournal] Error viewing file:', error.message);
    if (error.response) {
      console.error('[SafetyJournal] External API error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      // Если внешний API говорит, что файл не найден или недоступен
      if (error.response.data?.detail === 'Ошибка при просмотре файла') {
        return res.status(404).json({ 
          message: 'Файл не найден или недоступен для просмотра',
          details: 'Возможно, файл был удален или у вас нет прав на его просмотр'
        });
      }
      
      const errorData = {
        status: error.response.status,
        statusText: error.response.statusText,
        message: error.response.data?.message || error.response.data?.detail || 'Ошибка внешнего API'
      };
      res.status(error.response.status).json(errorData);
    } else {
      res.status(500).json({ message: 'Ошибка просмотра файла' });
    }
  }
};

// Скачивание файла
export const downloadFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }

    if (!JOURNALS_API_URL) {
      console.error('[SafetyJournal] JOURNALS_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }
    
    // Перенаправляем запрос на внешний API
    const response = await axios.get(`${JOURNALS_API_URL}/files/${fileId}/download`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'stream'
    });
    
    // Устанавливаем заголовки для скачивания файла
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/octet-stream',
      'Content-Disposition': response.headers['content-disposition'] || 'attachment',
      'Content-Length': response.headers['content-length']
    });
    
    response.data.pipe(res);
  } catch (error: any) {
    console.error('[SafetyJournal] Error downloading file:', error);
    if (error.response) {
      // Безопасно извлекаем данные ошибки без циклических ссылок
      const errorData = {
        status: error.response.status,
        statusText: error.response.statusText,
        message: error.response.data?.message || 'Ошибка внешнего API'
      };
      res.status(error.response.status).json(errorData);
    } else {
      res.status(500).json({ message: 'Ошибка скачивания файла' });
    }
  }
};

// Принятие решения по журналу филиала
export const makeBranchJournalDecision = async (req: Request, res: Response) => {
  try {
    const { branchJournalId } = req.params;
    
    // Получаем status из req.body или из FormData
    let status = req.body?.status;
    let comment = req.body.comment;

    if (!status && req.body && typeof req.body === 'object') {
      // Если status не найден в req.body, попробуем найти его в других полях
      status = req.body.status || req.body.decision;
    }
    
    const { userId, positionName, groupName } = (req as any).token;
    const token = getAuthToken(req);


    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // Проверяем доступ к изменению статуса (разрешаем under_review для всех при загрузке файлов)
    const hasAccess = await checkFileUploadStatusChangeAccess(userId, positionName, groupName, status);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Недостаточно прав для изменения статуса журнала' });
    }

    // Проверяем статус согласно API схеме
    if (!status || !['approved', 'rejected', 'under_review', 'pending'].includes(status)) {
      return res.status(400).json({ message: 'Неверный статус. Допустимые значения: approved, rejected, under_review, pending' });
    }

    // Получаем данные журнала ДО изменения статуса, чтобы гарантированно иметь branchId и journal_type
    interface JournalData {
      branch_id?: string;
      journal_type?: 'ОТ' | 'ПБ' | string;
      journal_title?: string;
    }
    
    let journalData: JournalData | null = null;
    let branchId: string | undefined;
    let journalType: string = '';
    
    try {
      const journalResponse = await axios.get<JournalData>(
        `${JOURNALS_API_URL}/branch_journals/${branchJournalId}`,
        {
          headers: createAuthHeaders(token)
        }
      );
      journalData = journalResponse.data;
      branchId = journalData?.branch_id;
      journalType = journalData?.journal_type || ''; // 'ОТ' или 'ПБ'
    } catch (journalError: any) {
      // Если журнал не найден (404), логируем, но продолжаем выполнение
      if (journalError.response?.status === 404) {
        console.warn(`[SafetyJournal] Journal ${branchJournalId} not found in external API before status change`);
      } else {
        console.error(`[SafetyJournal] Error getting journal data before status change:`, journalError.message);
      }
      // Продолжаем выполнение, но без данных для чата
    }

    // Отправляем запрос во внешний API для обновления статуса
    try {
      // Попробуем сначала с FormData (как в оригинальном коде)
      const formData = new FormData();
      formData.append('status', status);
      formData.append('decision', status);
      comment && formData.append('comment', comment)
      formData.append('user_id', userId);
      formData.append('branch_journal_id', branchJournalId);
      
      // Добавляем inspector: true если у пользователя есть полный доступ
      if (hasAccess) {
        formData.append('inspector', 'true');
      }

      const externalResponse = await axios.patch(
        `${JOURNALS_API_URL}/branch_journals/${branchJournalId}/decision`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      // Отправляем сообщение в чат при любом изменении статуса
      try {
        // Используем данные, полученные ДО изменения статуса
        // Если branchId не был получен ранее, пытаемся получить из ответа (на случай, если там есть)
        if (!branchId && externalResponse?.data) {
          const responseData = externalResponse.data as JournalData;
          branchId = responseData?.branch_id || branchId;
          journalType = responseData?.journal_type || journalType;
          journalData = responseData;
        }
        
        // Если все еще нет branchId, пытаемся найти журнал в списке филиалов
        if (!branchId) {
          try {
            const branchesResponse = await axios.get(
              `${JOURNALS_API_URL}/me/branches_with_journals`,
              { headers: createAuthHeaders(token) }
            );
            
            if (branchesResponse.data?.branches && Array.isArray(branchesResponse.data.branches)) {
              for (const branch of branchesResponse.data.branches) {
                if (branch.journals && Array.isArray(branch.journals)) {
                  const journal = branch.journals.find((j: any) => j.id === branchJournalId || j.branch_journal_id === branchJournalId);
                  if (journal) {
                    branchId = branch.branch_id;
                    journalType = journal.journal_type || '';
                    journalData = journal;
                    break;
                  }
                }
              }
            }
          } catch (branchesError: any) {
            console.error('[SafetyJournal] Error fetching branches list:', branchesError.message);
          }
        }

        if (branchId) {
          // Находим проверяющего (пользователя с FULL доступом или SUPERVISOR)
          const safetyTool = await prisma.tool.findFirst({
            where: { link: 'jurists/safety' }
          });

          let checkerId = userId; // По умолчанию используем текущего пользователя

          // Если текущий пользователь не проверяющий, находим проверяющего
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
          });

          if (user?.role !== 'SUPERVISOR' && safetyTool) {
            const userAccess = await prisma.userToolAccess.findFirst({
              where: {
                userId: userId,
                toolId: safetyTool.id,
                accessLevel: 'FULL'
              }
            });

            if (!userAccess) {
              // Ищем первого проверяющего
              const supervisor = await prisma.user.findFirst({
                where: { role: 'SUPERVISOR' },
                select: { id: true }
              });
              if (supervisor) {
                checkerId = supervisor.id;
              } else if (safetyTool) {
                const fullAccessUser = await prisma.userToolAccess.findFirst({
                  where: {
                    toolId: safetyTool.id,
                    accessLevel: 'FULL'
                  },
                  select: { userId: true }
                });
                if (fullAccessUser) {
                  checkerId = fullAccessUser.userId;
                }
              }
            }
          }

          // Получаем или создаем чат
          let chat = await (prisma as any).safetyJournalChat.findUnique({
            where: {
              branchId_checkerId: {
                branchId,
                checkerId
              }
            }
          });

          if (!chat) {
            chat = await (prisma as any).safetyJournalChat.create({
              data: {
                branchId,
                checkerId
              }
            });
          }

          // Формируем текст системного сообщения
          const journalTitle = journalData?.journal_title || 'Журнал';
          let messageText = '';
          
          if (status === 'approved') {
            messageText = `Журнал "${journalTitle}" (${journalType}) одобрен.`;
            if (comment) {
              messageText += `\n\nКомментарий: ${comment}`;
            }
          } else if (status === 'rejected') {
            messageText = `Журнал "${journalTitle}" (${journalType}) отклонен.`;
            if (comment) {
              messageText += `\n\nПричина: ${comment}`;
            }
          } else if (status === 'under_review') {
            messageText = `Журнал "${journalTitle}" (${journalType}) отправлен на проверку.`;
          } else if (status === 'pending') {
            messageText = `Журнал "${journalTitle}" (${journalType}) ожидает загрузки файлов.`;
          }

          // Создаем сообщение от имени проверяющего
          const systemMessage = await (prisma as any).safetyJournalChatMessage.create({
            data: {
              chatId: chat.id,
              senderId: userId, // Отправляем от имени проверяющего, который меняет статус
              message: messageText
            }
          });

          // Проверяем, что сообщение действительно создано в БД
          const verifyMessage = await (prisma as any).safetyJournalChatMessage.findUnique({
            where: { id: systemMessage.id },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          });
          
          // Обновляем updatedAt чата
          await (prisma as any).safetyJournalChat.update({
            where: { id: chat.id },
            data: { updatedAt: new Date() }
          });

          // Отправляем уведомление через Socket.IO
          const { SocketIOService } = await import('../../socketio.js');
          const socketService = SocketIOService.getInstance();
          
          // Отправляем сообщение проверяющему (всегда, даже если он отправитель, чтобы сообщение появилось в чате)
          if (checkerId) {
            try {
              // Используем sendChatMessage вместо sendToUser, чтобы не создавать уведомления
              socketService.sendChatMessage(checkerId, {
                type: 'SAFETY_JOURNAL_MESSAGE',
                chatId: chat.id,
                branchId: branchId,
                message: {
                  id: systemMessage.id,
                  message: messageText,
                  senderId: userId,
                  createdAt: systemMessage.createdAt.toISOString()
                }
              });
            } catch (checkerError) {
              console.error('[SafetyJournal] Error sending message to checker:', checkerError);
            }
          }
          
          // Получаем ответственных по филиалу и отправляем им сообщения в чат (все участники чата видят все сообщения)
          try {
            const responsiblesResponse = await axios.get(
              `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
              { headers: createAuthHeaders(token) }
            );

            // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
            if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
              for (const branchData of responsiblesResponse.data) {
                if (branchData.branch_id === branchId && branchData.responsibles && Array.isArray(branchData.responsibles)) {
                  const responsibles = branchData.responsibles;
                  
                  if (process.env.NODE_ENV === 'development') {
                    // Development logging can be added here if needed
                  }
                  
                  // Оптимизация: используем батчинг для поиска всех пользователей сразу
                  const userCache = new Map();
                  const usersMap = await findUsersByResponsiblesBatch(
                    prisma,
                    responsibles,
                    {
                      select: { id: true },
                      cache: userCache
                    }
                  );
                  
                  let sentCount = 0;
                  
                  // Отправляем сообщения ВСЕМ ответственным (без фильтрации по типу ответственности)
                  for (const resp of responsibles) {
                    const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
                    const responsibleUser = usersMap.get(key);

                    if (process.env.NODE_ENV === 'development') {
                      // Development logging can be added here if needed
                    }
                    
                    // Отправляем сообщение ответственному
                    if (responsibleUser && responsibleUser.id !== userId && responsibleUser.id !== checkerId) {
                      socketService.sendChatMessage(responsibleUser.id, {
                        type: 'SAFETY_JOURNAL_MESSAGE',
                        chatId: chat.id,
                        branchId: branchId,
                        message: {
                          id: systemMessage.id,
                          message: messageText,
                          senderId: userId,
                          createdAt: systemMessage.createdAt.toISOString()
                        }
                      });
                      sentCount++;
                    }
                  }
                  
                  if (process.env.NODE_ENV === 'development') {
                  }
                  
                  // Отправляем push-уведомления только тем, кто отвечает за соответствующий тип журнала
                  const { NotificationController } = await import('../app/notification.js');
                  
                  // ОПТИМИЗАЦИЯ: Получаем все данные заранее, вне цикла
                  const [sender, localBranch] = await Promise.all([
                    prisma.user.findUnique({
                      where: { id: userId },
                      select: { name: true }
                    }),
                    prisma.branch.findUnique({
                      where: { uuid: branchId },
                      select: { name: true }
                    }).catch(() => null)
                  ]);
                  
                  const senderName = sender?.name || 'Пользователь';
                  const branchName = branchData.branch_name || localBranch?.name || 'филиал';
                  const notificationBranchName = branchName && branchName !== 'филиала' ? branchName : 'филиал';
                  
                  // Фильтруем ответственных по типу журнала
                  const filteredResponsibles = responsibles.filter(
                    (resp: any) => resp.employee_id && resp.responsibility_type === journalType
                  );
                  
                  // Получаем всех пользователей одним батч-запросом
                  const responsibleUserIds = filteredResponsibles
                    .map((r: any) => r.employee_id)
                    .filter((id: any): id is string => !!id && id !== userId && id !== checkerId);
                  
                  const responsibleUsers = responsibleUserIds.length > 0
                    ? await prisma.user.findMany({
                        where: { id: { in: responsibleUserIds } },
                        select: { id: true, name: true, email: true }
                      })
                    : [];
                  
                  const responsibleUsersSet = new Set(responsibleUsers.map((u: any) => u.id));
                  const responsibleUsersMap = new Map(responsibleUsers.map((u: any) => [u.id, u]));
                  
                  // КРИТИЧНО: Логируем email адреса тех, кому отправляются уведомления
                  const recipientsEmails = filteredResponsibles
                    .filter((resp: any) => resp.employee_id && responsibleUsersSet.has(resp.employee_id))
                    .map((resp: any) => {
                      const user = responsibleUsersMap.get(resp.employee_id!);
                      return {
                        userId: user?.id,
                        name: user?.name,
                        email: user?.email || 'нет email',
                        responsibilityType: resp.responsibility_type
                      };
                    });
                  
                  // ОПТИМИЗАЦИЯ: Отправляем уведомления асинхронно, не блокируя ответ
                  const notificationPromises = filteredResponsibles
                    .filter((resp: any) => resp.employee_id && responsibleUsersSet.has(resp.employee_id))
                    .map((resp: any) => {
                      const receiverId = resp.employee_id!;
                      
                      // Отправляем асинхронно, не ждем завершения
                      return NotificationController.create({
                        type: 'INFO',
                        channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
                        title: senderName,
                        message: messageText.substring(0, 100),
                        senderId: userId,
                        receiverId: receiverId,
                        priority: 'MEDIUM',
                        ignoreEmailSettings: true, // Игнорируем настройку отключения почты для safety journal
                        action: {
                          type: 'NAVIGATE',
                          url: `/jurists/safety?branchId=${branchId}`,
                          branchName: notificationBranchName,
                        },
                      }).catch((error) => {
                        console.error(`[SafetyJournal] Error creating notification for ${receiverId}:`, error);
                        return null;
                      });
                    });
                  
                  // Не ждем завершения отправки уведомлений - они отправятся асинхронно
                  Promise.all(notificationPromises).then(() => {
                    // Notifications sent successfully
                  }).catch((error) => {
                    console.error('[SafetyJournal] Error sending some notifications:', error);
                  });
                  
                  // Отправляем уведомления асинхронно, не блокируя ответ
                  break; // Нашли нужный филиал, выходим из цикла
                }
              }
            }
          } catch (notifyError) {
            console.error('[SafetyJournal] Error sending notifications:', notifyError);
          }
        }
      } catch (chatError) {
        console.error('[SafetyJournal] Error sending message to chat:', chatError);
        // Не прерываем выполнение, если не удалось отправить в чат
      }

      res.json({ 
        message: `Журнал ${status === 'approved' ? 'одобрен' : status === 'rejected' ? 'отклонен' : 'возвращен на рассмотрение'}`,
        branchJournalId,
        comment,
        status,
        updatedAt: new Date().toISOString(),
        externalResponse: externalResponse.data
      });

    } catch (externalError: any) {
      console.error('[SafetyJournal] Error calling external API:', {
        status: externalError.response?.status,
        statusText: externalError.response?.statusText,
        responseData: externalError.response?.data,
        message: externalError.message,
        url: externalError.config?.url,
        method: externalError.config?.method,
        headers: externalError.config?.headers,
        requestData: externalError.config?.data
      });
      
      // Если внешний API недоступен, возвращаем ошибку
      return res.status(502).json({ 
        message: 'Ошибка обновления статуса во внешней системе',
        error: externalError.response?.data || externalError.message,
        details: {
          status: externalError.response?.status,
          url: externalError.config?.url,
          method: externalError.config?.method
        }
      });
    }

  } catch (error) {
    console.error('[SafetyJournal] Error making branch journal decision:', error);
    res.status(500).json({ message: 'Ошибка принятия решения по журналу' });
  }
};

// Прокси для открытия файлов в новом окне с токеном
export const proxyFile = async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    const token = getAuthToken(req);
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'URL не предоставлен' });
    }
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // Получаем файл с токеном авторизации
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'stream',
      timeout: 90000 // 90 секунд таймаут для больших файлов
    });

    // Устанавливаем заголовки для просмотра файла
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const contentDisposition = response.headers['content-disposition'] || 'inline';
    const contentLength = response.headers['content-length'];

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    if (contentLength) {
      res.set('Content-Length', contentLength);
    }
    
    // Добавляем CORS заголовки для iframe
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    });
    
    response.data.pipe(res);
  } catch (error: any) {
    console.error('[SafetyJournal] Error proxying file:', error);
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Ошибка получения файла',
        message: error.response.data?.message || 'Файл недоступен',
        status: error.response.status
      });
    } else {
      res.status(500).json({ 
        error: 'Ошибка проксирования файла',
        message: error.message 
      });
    }
  }
};

/* temporary functions before https on JOURNAL_API */

// Получение журналов филиала (прокси для внешнего API)
export const getBranchJournals = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query;
    
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({ message: 'branchId обязателен' });
    }
    
    if (!JOURNALS_API_URL) {
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // ИСПРАВЛЕНО: Убрали /v1 из пути, так как JOURNALS_API_URL уже содержит /api/v1
    const response = await axios.get(`${JOURNALS_API_URL}/branch_journals/?branchId=${branchId}`, {
      headers: createAuthHeaders(token),
      timeout: 20000 // 20 секунд — внешний API может отвечать медленно
    });
    
    // ИСПРАВЛЕНО: Правильная обработка ответа - внешний API возвращает массив журналов
    const journals = Array.isArray(response.data) ? response.data : (response.data?.data || []);
    
    
    res.json(journals);
  } catch (error: any) {
    console.error('[SafetyJournal] Error getting branch journals:', {
      message: error.message,
      code: error.code,
      branchId: req.query.branchId
    });
    
    // Обработка ошибок подключения и таймаута (ECONNABORTED = axios timeout)
    const isConnectionError = 
      error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.message?.includes('timeout');
    
    if (isConnectionError) {
      console.warn('[SafetyJournal] Branch journals unavailable (timeout/connection), returning empty array for branchId:', req.query.branchId);
      // 200 + [] — филиал загружается, журналы пустые (не блокируем UI)
      return res.json([]);
    }
    
    // Ошибки валидации (400) - возвращаем пустой массив, чтобы не блокировать работу чата
    if (error.response?.status === 400) {
      console.warn('[SafetyJournal] Branch journals API returned 400, returning empty array');
      return res.json([]);
    }
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      // При других ошибках возвращаем пустой массив, чтобы не блокировать работу чата
      res.json([]);
    }
  }
};

// КРИТИЧНО: Кэш для ответственных по филиалам (TTL: 2 минуты)
const responsibleCacheForEndpoint = new Map<string, { data: any; timestamp: number }>();
const RESPONSIBLE_CACHE_TTL = 2 * 60 * 1000; // 2 минуты

// КРИТИЧНО: Сбрасываем кэш ответственных при изменениях (POST/DELETE)
export const clearResponsibleCacheForBranch = (branchId: string) => {
  if (!branchId) return;
  responsibleCacheForEndpoint.delete(`responsible_${branchId}`);
};

export const getResponsible = async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query
    
    if (!branchId || typeof branchId !== 'string') {
      return res.status(400).json({ message: 'branchId обязателен' });
    }
    
    if (!JOURNALS_API_URL) {
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    // КРИТИЧНО: Проверяем кэш перед запросом к внешнему API
    const cacheKey = `responsible_${branchId}`;
    const cached = responsibleCacheForEndpoint.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < RESPONSIBLE_CACHE_TTL) {
      return res.json(cached.data);
    }

    // КРИТИЧНО: Используем короткий таймаут и Promise.race для быстрого ответа
    // ВАЖНО: НЕ кэшируем fallback-пустой ответ, иначе после назначения ответственного
    // пользователь будет 2 минуты видеть пустой/старый список.
    const authToken = getAuthToken(req);
    const response = await Promise.race([
      axios.get(`${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`, {
        headers: createAuthHeaders(authToken),
        timeout: 3000 // 3 секунды таймаут
      }),
      new Promise((resolve) => setTimeout(() => resolve({ __fallback: true, data: [] }), 3000))
    ]) as any;

    // Сохраняем в кэш только реальный ответ API (не fallback)
    if (response?.data && !response?.__fallback) {
      responsibleCacheForEndpoint.set(cacheKey, { data: response.data, timestamp: Date.now() });
      
      // Очищаем старые записи из кэша периодически
      if (responsibleCacheForEndpoint.size > 200) {
        const now = Date.now();
        for (const [key, value] of responsibleCacheForEndpoint.entries()) {
          if (now - value.timestamp > RESPONSIBLE_CACHE_TTL) {
            responsibleCacheForEndpoint.delete(key);
          }
        }
      }
    }

    res.json(response.data || []);
  } catch (error: any) {
    console.error('[SafetyJournal] Error getting responsible:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      branchId: req.query.branchId
    });
    
    // КРИТИЧНО: При любых ошибках возвращаем пустой массив, чтобы не блокировать UI
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return res.json([]); // Возвращаем пустой массив вместо 503
    }
    
    if (error.response) {
      // При ошибках от внешнего API возвращаем пустой массив
      return res.json([]);
    } else {
      // При любых других ошибках тоже возвращаем пустой массив
      return res.json([]);
    }
  }
};

export const addResponsible = async (req: Request, res: Response) => {
  try {
    const { branchId, employeeId, responsibilityType } = req.body

    // ИСПРАВЛЕНО: Валидация входных данных
    if (!branchId || !employeeId || !responsibilityType) {
      return res.status(400).json({ 
        message: 'Не все обязательные поля заполнены',
        details: { branchId: !!branchId, employeeId: !!employeeId, responsibilityType: !!responsibilityType }
      });
    }

    if (responsibilityType !== 'ОТ' && responsibilityType !== 'ПБ') {
      return res.status(400).json({ 
        message: 'responsibilityType должен быть "ОТ" или "ПБ"',
        received: responsibilityType
      });
    }

    if (!JOURNALS_API_URL) {
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут

    try {
      const response = await fetch(`${JOURNALS_API_URL}/branch_responsibles`, {
        method: 'POST',
        headers: createAuthHeaders(getAuthToken(req)),
        body: JSON.stringify({
          branchId,
          employeeId,
          responsibilityType 
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // ИСПРАВЛЕНО: Обрабатываем ответ от внешнего API
      let json;
      try {
        const text = await response.text();
        json = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('[SafetyJournal] Error parsing response:', parseError);
        json = { message: 'Ошибка парсинга ответа от внешнего API' };
      }
      
      // КРИТИЧНО: Сбрасываем кэш списка ответственных (даже при 409/422),
      // т.к. запись уже существует и нужно обновить список.
      if (branchId && (response.ok || response.status === 409 || response.status === 422)) {
        clearResponsibleCacheForBranch(branchId);
      }
      
      // ИСПРАВЛЕНО: Обработка ошибки дубликата
      if (response.status === 409 || response.status === 422) {
        const errorMessage = json.message || json.detail || 'Ответственный уже назначен на этот филиал';
        return res.status(response.status).json({
          message: errorMessage,
          code: 'DUPLICATE',
          details: json
        });
      }
      
      res.status(response.status).json(json);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }

  } catch (error: any) {
    console.error('[SafetyJournal] Error adding responsible:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Обработка ошибок подключения и таймаутов
    if (error.name === 'AbortError' || error.message === 'TIMEOUT' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(503).json({ 
        message: 'Превышено время ожидания ответа от внешнего API',
        errorCode: 'TIMEOUT'
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return res.status(503).json({ 
        message: 'Внешний API недоступен',
        errorCode: error.code || 'CONNECTION_ERROR'
      });
    }
    
    // Общая ошибка
    res.status(500).json({ 
      message: 'Ошибка добавления ответственного',
      error: error.message,
      errorCode: error.code || 'UNKNOWN_ERROR'
    });
  }
};

export const deleteResponsible = async (req: Request, res: Response) => {
  try {
    const { branchId, employeeId, responsibilityType } = req.body

    if (!JOURNALS_API_URL) {
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут

    try {
      const response = await fetch(`${JOURNALS_API_URL}/branch_responsibles`, {
        method: 'DELETE',
        headers: createAuthHeaders(getAuthToken(req)),
        body: JSON.stringify({
          branchId,
          employeeId,
          responsibilityType 
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const json = await response.json()
      
      // Очищаем кэш ответственных для этого филиала
      if (response.ok && branchId) {
        clearResponsibleCacheForBranch(branchId);
      }
      
      res.status(response.status).json(json);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error: any) {
    console.error('[SafetyJournal] Error deleting responsible:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Обработка ошибок подключения
    if (error.name === 'AbortError' || error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(503).json({ 
        message: 'Превышено время ожидания ответа от внешнего API',
        errorCode: 'TIMEOUT'
      });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return res.status(503).json({ 
        message: 'Внешний API недоступен',
        errorCode: error.code || 'CONNECTION_ERROR'
      });
    }
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ 
        message: 'Ошибка удаления ответственного',
        error: error.message,
        errorCode: error.code
      });
    }
  }
};

// Оповещение филиалов с не заполненными журналами
export const notifyBranchesWithUnfilledJournals = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).token;
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // Получаем филиалы с журналами
    // ИСПРАВЛЕНО: Добавляем таймаут для предотвращения зависания запроса
    const branchesStartTime = Date.now();
    let branchesResponse;
    try {
      branchesResponse = await axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
        headers: createAuthHeaders(token),
        timeout: 10000 // 10 секунд таймаут
      });
    } catch (error: any) {
      console.error('[SafetyJournal] Error fetching branches:', {
        duration: `${Date.now() - branchesStartTime}ms`,
        error: error?.message,
        code: error?.code,
        status: error?.response?.status
      });
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return res.status(503).json({ 
          message: 'Превышено время ожидания ответа от внешнего API при получении филиалов',
          errorCode: 'TIMEOUT'
        });
      }
      
      if (error.response?.status === 500) {
        return res.status(503).json({ 
          message: 'Внешний API вернул ошибку 500 при получении филиалов',
          errorCode: 'EXTERNAL_API_ERROR'
        });
      }
      
      throw error;
    }

    const branches = branchesResponse.data.branches || [];
    
    // Находим филиалы с не заполненными журналами (status === 'pending' и filled_at === null)
    const branchesWithUnfilledJournals = branches.filter((branch: any) => {
      return branch.journals && branch.journals.some((journal: any) => 
        journal.status === 'pending' && !journal.filled_at
      );
    });

    if (branchesWithUnfilledJournals.length === 0) {
      return res.json({ 
        message: 'Нет филиалов с не заполненными журналами',
        notifiedBranches: []
      });
    }

    // Получаем ответственных по каждому филиалу и отправляем уведомления
    const notifiedBranches = [];
    const { NotificationController } = await import('../app/notification.js');
    const { SocketIOService } = await import('../../socketio.js');
    const socketService = SocketIOService.getInstance();

    for (const branch of branchesWithUnfilledJournals) {
      try {
        // Получаем ответственных по филиалу
        // ИСПРАВЛЕНО: Добавляем таймаут и обработку ошибок для предотвращения зависания
        const responsiblesStartTime = Date.now();
        let responsiblesResponse;
        try {
          responsiblesResponse = await axios.get(
            `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branch.branch_id}`,
            { 
              headers: createAuthHeaders(token),
              timeout: 10000 // 10 секунд таймаут
            }
          );
        } catch (error: any) {
          console.error(`[SafetyJournal] Error fetching responsibles for branch ${branch.branch_id}:`, {
            duration: `${Date.now() - responsiblesStartTime}ms`,
            error: error?.message,
            code: error?.code,
            status: error?.response?.status
          });
          
          // Пропускаем этот филиал и продолжаем с другими
          if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
            console.warn(`[SafetyJournal] Timeout fetching responsibles for branch ${branch.branch_id}, skipping`);
            continue;
          }
          
          if (error.response?.status === 500) {
            console.warn(`[SafetyJournal] External API error 500 for branch ${branch.branch_id}, skipping`);
            continue;
          }
          
          // Для других ошибок тоже пропускаем филиал, чтобы не блокировать обработку остальных
          console.warn(`[SafetyJournal] Error fetching responsibles for branch ${branch.branch_id}, skipping:`, error?.message);
          continue;
        }

        // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
        let responsibles: any[] = [];
        if (responsiblesResponse.data && Array.isArray(responsiblesResponse.data)) {
          for (const branchData of responsiblesResponse.data) {
            if (branchData.branch_id === branch.branch_id && branchData.responsibles && Array.isArray(branchData.responsibles)) {
              responsibles = branchData.responsibles;
              break;
            }
          }
        }
        
        // Получаем список не заполненных журналов
        const unfilledJournals = branch.journals.filter((journal: any) => 
          journal.status === 'pending' && !journal.filled_at
        );

        const journalTitles = unfilledJournals.map((j: any) => `${j.journal_title} (${j.journal_type})`).join(', ');

        // КРИТИЧНО: Определяем типы журналов, которые требуют заполнения (ОТ или ПБ)
        const requiredResponsibilityTypes = new Set<string>();
        unfilledJournals.forEach((journal: any) => {
          if (journal.journal_type === 'ОТ' || journal.journal_type === 'ПБ') {
            requiredResponsibilityTypes.add(journal.journal_type);
          }
        });

        // КРИТИЧНО: Фильтруем ответственных по типу ответственности (ОТ и ПБ)
        // и дедуплицируем - если один человек отвечает и за ОТ, и за ПБ, отправляем уведомление только один раз
        const uniqueResponsibles = new Map<string, any>();
        for (const resp of responsibles) {
          // Проверяем, что ответственный отвечает за нужный тип журнала (ОТ или ПБ)
          if (resp.employee_id && 
              resp.responsibility_type && 
              requiredResponsibilityTypes.has(resp.responsibility_type)) {
            // Если ответственный уже есть в мапе, проверяем, нужно ли добавить еще один тип ответственности
            if (!uniqueResponsibles.has(resp.employee_id)) {
              uniqueResponsibles.set(resp.employee_id, resp);
            } else {
              // Если у ответственного уже есть один тип, но он отвечает и за другой нужный тип - обновляем
              const existing = uniqueResponsibles.get(resp.employee_id);
              if (!existing.responsibility_types) {
                existing.responsibility_types = [existing.responsibility_type];
              }
              if (!existing.responsibility_types.includes(resp.responsibility_type)) {
                existing.responsibility_types.push(resp.responsibility_type);
              }
            }
          }
        }
        
        // ОПТИМИЗАЦИЯ: Получаем все данные заранее, вне цикла
        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true }
        });
        
        const senderName = sender?.name || 'Пользователь';
        const notificationBranchName = branch.branch_name && branch.branch_name !== 'филиала' ? branch.branch_name : 'филиал';
        
        // КРИТИЧНО: Используем findUsersByResponsiblesBatch для поиска пользователей по employee_id, email и name
        const responsiblesArray = Array.from(uniqueResponsibles.values());
        
        const userCache = new Map();
        const responsibleUsersMap = await findUsersByResponsiblesBatch(
          prisma,
          responsiblesArray,
          {
            select: { id: true, name: true, email: true },
            cache: userCache
          }
        );
        
        // КРИТИЧНО: Логируем email адреса тех, кому отправляются уведомления
        const recipientsEmails: any[] = [];
        const notFoundResponsibles: any[] = [];
        
        for (const resp of responsiblesArray) {
          const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
          const user = responsibleUsersMap.get(key);
          
          if (user) {
            recipientsEmails.push({
              userId: user.id,
              name: user.name,
              email: user.email || 'нет email',
              responsibilityType: resp.responsibility_type,
              searchKey: key
            });
          } else {
            notFoundResponsibles.push({
              employee_id: resp.employee_id,
              employee_email: resp.employee_email,
              employee_name: resp.employee_name,
              responsibility_type: resp.responsibility_type,
              searchKey: key
            });
          }
        }
        
        if (notFoundResponsibles.length > 0) {
          console.warn('[SafetyJournal] notifyBranchesWithUnfilledJournals - responsibles NOT found in DB:', {
            branchId: branch.branch_id,
            notFound: notFoundResponsibles
          });
        }
        
        // ОПТИМИЗАЦИЯ: Отправляем уведомления асинхронно, не блокируя ответ
        const notificationPromises = responsiblesArray
          .map(resp => {
            const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
            const responsibleUser = responsibleUsersMap.get(key);
            
            if (!responsibleUser) {
              return null; // Пропускаем, если пользователь не найден
            }
            
            return responsibleUser;
          })
          .filter((user): user is NonNullable<typeof user> => user !== null)
          .map(responsibleUser => {
            
            // Отправляем через Socket.IO сразу (синхронно)
            socketService.sendToUser(responsibleUser.id, {
              type: 'WARNING',
              title: 'Требуется заполнение журналов',
              message: `Филиал "${branch.branch_name}" имеет не заполненные журналы: ${journalTitles}`,
              createdAt: new Date().toISOString(),
              action: {
                type: 'NAVIGATE',
                url: `/jurists/safety?branchId=${branch.branch_id}`,
              },
            });
            
            // Отправляем уведомление асинхронно, не ждем завершения
            return NotificationController.create({
              type: 'WARNING',
              channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
              title: senderName,
              message: `Филиал "${branch.branch_name}" имеет не заполненные журналы: ${journalTitles}`,
              senderId: userId,
              receiverId: responsibleUser.id,
              priority: 'MEDIUM',
              ignoreEmailSettings: true, // Игнорируем настройку отключения почты для safety journal
              action: {
                type: 'NAVIGATE',
                url: `/jurists/safety?branchId=${branch.branch_id}`,
                branchName: notificationBranchName,
              },
            }).catch((error) => {
              console.error(`[SafetyJournal] Error creating notification for ${responsibleUser.id}:`, error);
              return null;
            });
          });
        
        // Не ждем завершения отправки уведомлений - они отправятся асинхронно
        Promise.all(notificationPromises).then(() => {
          // Notifications sent successfully
        }).catch((error) => {
          console.error('[SafetyJournal] Error sending some notifications:', error);
        });

        // Сохраняем информацию о последнем оповещении асинхронно (не блокируем ответ)
        const notificationData = {
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          notifiedAt: new Date().toISOString(),
          notifiedBy: userId,
          unfilledJournals: unfilledJournals.map((j: any) => ({
            id: j.id,
            title: j.journal_title,
            type: j.journal_type
          }))
        };

        // Сохраняем в UserSettings асинхронно (не блокируем ответ)
        prisma.userSettings.upsert({
          where: {
            userId_parameter: {
              userId: userId,
              parameter: `safety_journal_notification_${branch.branch_id}`
            }
          },
          update: {
            value: JSON.stringify(notificationData)
          },
          create: {
            userId: userId,
            parameter: `safety_journal_notification_${branch.branch_id}`,
            value: JSON.stringify(notificationData),
            type: 'STRING'
          }
        }).catch((error) => {
          console.error(`[SafetyJournal] Error saving notification data for branch ${branch.branch_id}:`, error);
        });

        notifiedBranches.push({
          branchId: branch.branch_id,
          branchName: branch.branch_name,
          notifiedAt: notificationData.notifiedAt,
          unfilledJournalsCount: unfilledJournals.length
        });
      } catch (branchError) {
        console.error(`[SafetyJournal] Error notifying branch ${branch.branch_id}:`, branchError);
      }
    }

    if (notifiedBranches.length === 0) {
      return res.status(400).json({ 
        message: 'Не удалось отправить оповещения ни для одного филиала',
        notifiedBranches: []
      });
    }

    res.json({
      message: `Оповещения отправлены для ${notifiedBranches.length} филиалов`,
      notifiedBranches
    });
  } catch (error: any) {
    console.error('[SafetyJournal] Error notifying branches:', {
      error: error,
      errorMessage: error?.message,
      errorStack: error?.stack
    });
    
    // Возвращаем более детальную информацию об ошибке
    const errorMessage = error?.response?.data?.message || error?.message || 'Ошибка отправки оповещений';
    const statusCode = error?.response?.status || error?.statusCode || 500;
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};

// Оповещение одного филиала с не заполненными журналами
export const notifyBranchWithUnfilledJournals = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { userId } = (req as any).token;
    const token = getAuthToken(req);
    const { branchId } = req.params;
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    if (!branchId) {
      return res.status(400).json({ message: 'ID филиала не указан' });
    }

    // ОПТИМИЗАЦИЯ: Получаем филиалы и ответственных параллельно для ускорения
    // ИСПРАВЛЕНО: Уменьшаем таймауты до 5 секунд для более быстрого ответа
    const [branchesResponse, responsiblesResponse] = await Promise.allSettled([
      axios.get(`${JOURNALS_API_URL}/me/branches_with_journals`, {
        headers: createAuthHeaders(token),
        timeout: 5000 // 5 секунд таймаут (уменьшено с 10)
      }),
      axios.get(
        `${JOURNALS_API_URL}/branch_responsibles/?branchId=${branchId}`,
        { 
          headers: createAuthHeaders(token),
          timeout: 5000 // 5 секунд таймаут (уменьшено с 10)
        }
      )
    ]);

    // Обрабатываем результат получения филиалов
    if (branchesResponse.status === 'rejected') {
      const error = branchesResponse.reason;
      console.error('[SafetyJournal] Error fetching branches:', {
        error: error?.message,
        code: error?.code,
        status: error?.response?.status
      });
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        return res.status(503).json({ 
          message: 'Превышено время ожидания ответа от внешнего API при получении филиалов',
          errorCode: 'TIMEOUT'
        });
      }
      
      if (error.response?.status === 500) {
        return res.status(503).json({ 
          message: 'Внешний API вернул ошибку 500 при получении филиалов',
          errorCode: 'EXTERNAL_API_ERROR'
        });
      }
      
      return res.status(503).json({ 
        message: 'Ошибка получения данных филиалов',
        errorCode: 'EXTERNAL_API_ERROR'
      });
    }

    const branches = branchesResponse.value.data.branches || [];
    
    // Находим нужный филиал
    const branch = branches.find((b: any) => b.branch_id === branchId);
    
    if (!branch) {
      return res.status(404).json({ message: 'Филиал не найден' });
    }

    // Проверяем, есть ли не заполненные журналы
    const unfilledJournals = branch.journals.filter((journal: any) => 
      journal.status === 'pending' && !journal.filled_at
    );

    if (unfilledJournals.length === 0) {
      return res.json({ 
        message: 'У филиала нет не заполненных журналов',
        notified: false
      });
    }

    // КРИТИЧНО: Определяем типы журналов, которые требуют заполнения (ОТ или ПБ)
    const requiredResponsibilityTypes = new Set<string>();
    unfilledJournals.forEach((journal: any) => {
      if (journal.journal_type === 'ОТ' || journal.journal_type === 'ПБ') {
        requiredResponsibilityTypes.add(journal.journal_type);
      }
    });
    

    // Обрабатываем результат получения ответственных
    if (responsiblesResponse.status === 'rejected') {
      const error = responsiblesResponse.reason;
      console.error('[SafetyJournal] Error fetching responsibles:', {
        error: error?.message,
        code: error?.code,
        status: error?.response?.status,
        branchId: branch.branch_id
      });
      
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        return res.status(503).json({ 
          message: 'Превышено время ожидания ответа от внешнего API при получении ответственных',
          errorCode: 'TIMEOUT',
          branchId: branch.branch_id
        });
      }
      
      if (error?.response?.status === 500) {
        return res.status(503).json({ 
          message: 'Внешний API вернул ошибку 500 при получении ответственных',
          errorCode: 'EXTERNAL_API_ERROR',
          branchId: branch.branch_id
        });
      }
      
      return res.status(503).json({ 
        message: 'Ошибка получения данных ответственных',
        errorCode: 'EXTERNAL_API_ERROR',
        branchId: branch.branch_id
      });
    }
    // Структура ответа: массив объектов [{ branch_id, branch_name, responsibles: [...] }]
    let responsibles: any[] = [];
    if (responsiblesResponse.value.data && Array.isArray(responsiblesResponse.value.data)) {
      for (const branchData of responsiblesResponse.value.data) {
        if (branchData.branch_id === branch.branch_id && branchData.responsibles && Array.isArray(branchData.responsibles)) {
          responsibles = branchData.responsibles;
          break;
        }
      }
    }

    if (responsibles.length === 0) {
      return res.json({ 
        message: 'У филиала нет назначенных ответственных',
        notified: false
      });
    }

    const journalTitles = unfilledJournals.map((j: any) => `${j.journal_title} (${j.journal_type})`).join(', ');

    // Получаем ответственных по каждому филиалу и отправляем уведомления
    const { NotificationController } = await import('../app/notification.js');
    const { SocketIOService } = await import('../../socketio.js');
    const socketService = SocketIOService.getInstance();

    // КРИТИЧНО: Фильтруем ответственных по типу ответственности (ОТ и ПБ)
    // и дедуплицируем - если один человек отвечает и за ОТ, и за ПБ, отправляем уведомление только один раз
    const uniqueResponsibles = new Map<string, any>();
    for (const resp of responsibles) {
      // Проверяем, что ответственный отвечает за нужный тип журнала (ОТ или ПБ)
      if (resp.employee_id && 
          resp.responsibility_type && 
          requiredResponsibilityTypes.has(resp.responsibility_type)) {
        // Если ответственный уже есть в мапе, проверяем, нужно ли добавить еще один тип ответственности
        if (!uniqueResponsibles.has(resp.employee_id)) {
          uniqueResponsibles.set(resp.employee_id, resp);
        } else {
          // Если у ответственного уже есть один тип, но он отвечает и за другой нужный тип - обновляем
          const existing = uniqueResponsibles.get(resp.employee_id);
          if (!existing.responsibility_types) {
            existing.responsibility_types = [existing.responsibility_type];
          }
          if (!existing.responsibility_types.includes(resp.responsibility_type)) {
            existing.responsibility_types.push(resp.responsibility_type);
          }
        }
      }
    }
    // ОПТИМИЗАЦИЯ: Получаем все данные заранее, вне цикла
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });

    const senderName = sender?.name || 'Пользователь';

    const notificationBranchName = branch.branch_name && branch.branch_name !== 'филиала' ? branch.branch_name : 'филиал';

    // КРИТИЧНО: Логируем employee_id из внешнего API перед поиском в БД
    const responsiblesArray = Array.from(uniqueResponsibles.values());

    // КРИТИЧНО: Используем findUsersByResponsiblesBatch для поиска пользователей по employee_id, email и name
    // Это та же логика, что используется в getChatParticipants
    const userCache = new Map();
    const responsibleUsersMap = await findUsersByResponsiblesBatch(
      prisma,
      responsiblesArray,
      {
        select: { id: true, name: true, email: true },
        cache: userCache
      }
    );

    // ...

    // КРИТИЧНО: Логируем email адреса тех, кому отправляются уведомления
    // Используем ключ из responsibleUsersMap (может быть employee_id, email или name)
    const recipientsEmails: any[] = [];
    const notFoundResponsibles: any[] = [];
    
    for (const resp of responsiblesArray) {
      const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
      const user = responsibleUsersMap.get(key);
      
      if (user) {
        recipientsEmails.push({
          userId: user.id,
          name: user.name,
          email: user.email || 'нет email',
          responsibilityType: resp.responsibility_type,
          searchKey: key
        });
      } else {
        notFoundResponsibles.push({
          employee_id: resp.employee_id,
          employee_email: resp.employee_email,
          employee_name: resp.employee_name,
          responsibility_type: resp.responsibility_type,
          searchKey: key
        });
      }
    }
    
    if (notFoundResponsibles.length > 0) {
      console.warn('[SafetyJournal] notifyBranchWithUnfilledJournals - responsibles NOT found in DB:', {
        branchId: branch.branch_id,
        notFound: notFoundResponsibles
      });
    }

    // Remove orphaned object properties
    // const notificationData = {
    //   branchId: branch.branch_id,
    //   branchName: branch.branch_name,
    //   recipients: recipientsEmails,
    //   recipientsCount: recipientsEmails.length
    // });

    // ОПТИМИЗАЦИЯ: Отправляем уведомления асинхронно, не блокируя ответ
    const notificationPromises = responsiblesArray
      .map(resp => {
        const key = resp.employee_id || resp.employee_email || resp.employee_name || '';
        const responsibleUser = responsibleUsersMap.get(key);
        if (!responsibleUser) {
          return null; // Пропускаем, если пользователь не найден
        }
        
        return responsibleUser;
      })
      .filter((user): user is NonNullable<typeof user> => user !== null)
      .map(responsibleUser => {
        
        // Отправляем через Socket.IO сразу (синхронно)
        socketService.sendToUser(responsibleUser.id, {
          type: 'WARNING',
          title: 'Требуется заполнение журналов',
          message: `Филиал "${branch.branch_name}" имеет не заполненные журналы: ${journalTitles}`,
          createdAt: new Date().toISOString(),
          action: {
            type: 'NAVIGATE',
            url: `/jurists/safety?branchId=${branch.branch_id}`,
          },
        });
        
        // Отправляем уведомление асинхронно, не ждем завершения
        return NotificationController.create({
          type: 'WARNING',
          channels: ['IN_APP', 'TELEGRAM', 'EMAIL'],
          title: senderName,
          message: `Филиал "${branch.branch_name}" имеет не заполненные журналы: ${journalTitles}`,
          senderId: userId,
          receiverId: responsibleUser.id,
          priority: 'MEDIUM',
          ignoreEmailSettings: true, // Игнорируем настройку отключения почты для safety journal
          action: {
            type: 'NAVIGATE',
            url: `/jurists/safety?branchId=${branch.branch_id}`,
            branchName: notificationBranchName,
          },
        }).catch((error) => {
          console.error(`[SafetyJournal] Error creating notification for ${responsibleUser.id}:`, error);
          return null;
        });
      })
      .filter((promise): promise is Promise<any> => promise !== null); // Фильтруем null значения
    
    const notifiedCount = notificationPromises.length;
    
    // Сохраняем информацию о последнем оповещении асинхронно (не блокируем ответ)
    const notificationData = {
      branchId: branch.branch_id,
      branchName: branch.branch_name,
      notifiedAt: new Date().toISOString(),
      notifiedBy: userId,
      unfilledJournals: unfilledJournals.map((j: any) => ({
        id: j.id,
        title: j.journal_title,
        type: j.journal_type
      }))
    };

    // Сохраняем в UserSettings асинхронно (не блокируем ответ)
    prisma.userSettings.upsert({
      where: {
        userId_parameter: {
          userId: userId,
          parameter: `safety_journal_notification_${branch.branch_id}`
        }
      },
      update: {
        value: JSON.stringify(notificationData)
      },
      create: {
        userId: userId,
        parameter: `safety_journal_notification_${branch.branch_id}`,
        value: JSON.stringify(notificationData),
        type: 'STRING'
      }
    }).catch((error) => {
      console.error('[SafetyJournal] Error saving notification:', error);
    });

    // ВОЗВРАЩАЕМ ОТВЕТ СРАЗУ, не дожидаясь отправки уведомлений и сохранения в БД
    const duration = Date.now() - startTime;
    
    // Возвращаем ответ сразу
    res.json({
      message: `Оповещения отправлены для филиала "${branch.branch_name}"`,
      branchId: branch.branch_id,
      branchName: branch.branch_name,
      notifiedCount,
      unfilledJournalsCount: unfilledJournals.length
    });
  } catch (error: any) {
    console.error('[SafetyJournal] Error notifying branch:', {
      error: error,
      errorMessage: error?.message,
      errorStack: error?.stack,
      branchId: req.params?.branchId
    });
    
    // Возвращаем более детальную информацию об ошибке
    const errorMessage = error?.response?.data?.message || error?.message || 'Ошибка отправки оповещения';
    const statusCode = error?.response?.status || error?.statusCode || 500;
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};

// Получить информацию о последних оповещениях
export const getLastNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = (req as any).token;
    
    // Получаем все записи о последних оповещениях для текущего пользователя
    const notifications = await withDbRetry(
      () =>
        prisma.userSettings.findMany({
          where: {
            userId: userId,
            parameter: {
              startsWith: 'safety_journal_notification_'
            }
          },
          select: {
            parameter: true,
            value: true
          }
        }),
      { logPrefix: '[SafetyJournal]' }
    );

    const notificationsData = notifications.map(n => {
      const branchId = n.parameter.replace('safety_journal_notification_', '');
      try {
        const data = JSON.parse(n.value);
        return {
          branchId,
          ...data
        };
      } catch {
        return {
          branchId,
          notifiedAt: new Date().toISOString()
        };
      }
    });

    res.json(notificationsData);
  } catch (error: unknown) {
    if (isP1001(error)) {
      console.error('[SafetyJournal] getLastNotifications: database unreachable (P1001).');
      res.status(503).json([]);
      return;
    }
    console.error('[SafetyJournal] Error getting last notifications:', error);
    res.status(500).json({ message: 'Ошибка получения информации об оповещениях' });
  }
};