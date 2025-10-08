import { Request, Response } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import { prisma } from '../../server.js';
import { decodeRussianFileName } from '../../utils/format.js';

// Базовый URL для внешнего API
// ВАЖНО: Создайте файл .env в корне проекта и добавьте:
// EXTERNAL_API_URL=http://10.0.128.95:8000/api/v1
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'http://10.0.128.95:8000/api/v1';

// Функция для получения токена из заголовков
const getAuthToken = (req: Request): string | null => {
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    console.error('No authorization header found in request');
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
    console.log('Checking file upload status change access for:', { userId, positionName, groupName, newStatus });
    
    // Разрешаем изменение статуса на "under_review" для всех пользователей при загрузке файлов
    if (newStatus === 'under_review') {
      console.log('Status change to under_review allowed for all users during file upload');
      return true;
    }
    
    // Для других статусов используем обычную проверку прав
    return await checkSafetyJournalAccess(userId, positionName, groupName);
  } catch (error) {
    console.error('Error checking file upload status change access:', error);
    return false;
  }
};

// Функция для проверки доступа к jurists/safety (только для управления статусами)
const checkSafetyJournalAccess = async (userId: string, positionName: string, groupName: string): Promise<boolean> => {
  try {
    console.log('Checking safety journal access for:', { userId, positionName, groupName });
    
    // Сначала проверяем роль пользователя - SUPERVISOR имеет полный доступ
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role === 'SUPERVISOR') {
      console.log('User is SUPERVISOR - full access granted');
      return true;
    }
    
    // Ищем инструмент jurists/safety
    const safetyTool = await prisma.tool.findFirst({
      where: { link: 'jurists/safety' }
    });

    if (!safetyTool) {
      console.log('Safety tool not found');
      return false;
    }

    console.log('Safety tool found:', { id: safetyTool.id, name: safetyTool.name });

    // Проверяем доступ на уровне пользователя - только FULL доступ
    const userAccess = await prisma.userToolAccess.findFirst({
      where: {
        userId: userId,
        toolId: safetyTool.id,
        accessLevel: 'FULL' // Только FULL доступ для управления статусами
      }
    });

    if (userAccess) {
      console.log('User access found:', { accessLevel: userAccess.accessLevel });
      return true;
    }

    // Проверяем доступ на уровне должности - только FULL доступ
    const position = await prisma.position.findFirst({
      where: { name: positionName }
    });

    if (position) {
      console.log('Position found:', { uuid: position.uuid, name: position.name });
      const positionAccess = await prisma.positionToolAccess.findFirst({
        where: {
          positionId: position.uuid,
          toolId: safetyTool.id,
          accessLevel: 'FULL' // Только FULL доступ для управления статусами
        }
      });

      if (positionAccess) {
        console.log('Position access found:', { accessLevel: positionAccess.accessLevel });
        return true;
      }
    }

    // Проверяем доступ на уровне группы - только FULL доступ
    if (groupName) {
      const group = await prisma.group.findFirst({
        where: { name: groupName }
      });

      if (group) {
        console.log('Group found:', { uuid: group.uuid, name: group.name });
        const groupAccess = await prisma.groupToolAccess.findFirst({
          where: {
            groupId: group.uuid,
            toolId: safetyTool.id,
            accessLevel: 'FULL' // Только FULL доступ для управления статусами
          }
        });

        if (groupAccess) {
          console.log('Group access found:', { accessLevel: groupAccess.accessLevel });
          return true;
        }
      }
    }

    console.log('No access found for safety journal management');
    return false;
  } catch (error) {
    console.error('Error checking safety journal access:', error);
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
    console.error('Error getting current user:', error);
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
    const branchesResponse = await axios.get(`${EXTERNAL_API_URL}/me/branches_with_journals`, {
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
  } catch (error) {
    console.error('Error getting branches with journals:', error);
    
    // Если внешний API недоступен, возвращаем пустой список с информацией об ошибке
    if ((error as any).code === 'ECONNREFUSED' || (error as any).message?.includes('ECONNREFUSED')) {
      res.json({ 
        branches: [],
        hasFullAccess: false,
        error: 'Внешний API недоступен. Данные не могут быть загружены.',
        apiUnavailable: true
      });
    } else {
      res.status(500).json({ message: 'Ошибка получения филиалов с журналами' });
    }
  }
};

// Функция для получения количества файлов журнала
async function getJournalFilesCount(journalId: string, token: string): Promise<number> {
  try {
    return 0;
  } catch (error) {
    console.error(`Error getting files count for journal ${journalId}:`, error);
    return 0;
  }
}

// Функция для получения списка файлов журнала
async function getJournalFiles(journalId: string, token: string): Promise<any[]> {
  try {
    const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'http://10.0.128.95:8000/api/v1';
    
    // Попробуем разные эндпоинты для получения файлов
    const endpoints = [
      `${EXTERNAL_API_URL}/files/?branch_journal_id=${journalId}`,
      `${EXTERNAL_API_URL}/files/?journal_id=${journalId}`,
      `${EXTERNAL_API_URL}/journals/${journalId}/files`,
      `${EXTERNAL_API_URL}/branch_journals/${journalId}/files`,
      `${EXTERNAL_API_URL}/files/`
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
    console.error(`Error getting files for journal ${journalId}:`, error.response?.data || error.message);
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
    console.log('File name encoding correction:', {
      original: file?.originalname,
      corrected: correctedFileName
    });

    console.log('Upload file request:', {
      branchJournalId,
      file: file ? {
        originalname: file.originalname,
        correctedName: correctedFileName,
        mimetype: file.mimetype,
        size: file.size,
        bufferLength: file.buffer?.length,
        encoding: file.encoding,
        fieldname: file.fieldname
      } : null,
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length']
      }
    });

    if (!file) {
      console.log('No file provided');
      return res.status(400).json({ message: 'Файл не предоставлен' });
    }

    if (!branchJournalId) {
      console.log('No branchJournalId provided');
      return res.status(400).json({ message: 'ID журнала филиала не предоставлен' });
    }

    if (!EXTERNAL_API_URL) {
      console.error('EXTERNAL_API_URL is not defined');
      return res.status(500).json({ message: 'Внешний API не настроен' });
    }

    const token = getAuthToken(req);
    
    if (!token) {
      console.log('No auth token found');
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }

    // Проверяем валидность файла
    if (!file.buffer || file.buffer.length === 0) {
      console.error('File buffer is empty or invalid:', {
        bufferExists: !!file.buffer,
        bufferLength: file.buffer?.length,
        fileName: file.originalname
      });
      return res.status(400).json({ message: 'Файл поврежден или пуст' });
    }

    if (file.size !== file.buffer.length) {
      console.warn('File size mismatch:', {
        declaredSize: file.size,
        bufferLength: file.buffer.length,
        fileName: file.originalname
      });
    }

    // Специальная проверка для PDF файлов
    if (file.mimetype === 'application/pdf' || (correctedFileName && correctedFileName.toLowerCase().endsWith('.pdf'))) {
      console.log('PDF file detected, performing additional checks:', {
        fileName: correctedFileName,
        originalFileName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        bufferLength: file.buffer.length
      });

      // Проверяем PDF заголовок
      const pdfHeader = file.buffer.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        console.error('Invalid PDF file - missing PDF header:', {
          fileName: correctedFileName,
          originalFileName: file.originalname,
          header: pdfHeader,
          expectedHeader: '%PDF'
        });
        return res.status(400).json({ message: 'Некорректный PDF файл' });
      }

      console.log('PDF file validation passed');
    }

    console.log('Preparing to upload file to external API:', {
      url: `${EXTERNAL_API_URL}/files/`,
      fileName: correctedFileName,
      originalFileName: file.originalname,
      fileSize: file.size,
      bufferLength: file.buffer.length,
      branchJournalId,
      mimetype: file.mimetype
    });

    // Создаем FormData для отправки файла
    const formData = new FormData();
    formData.append('branchJournalId', branchJournalId);
    
    try {
      formData.append('file', file.buffer, {
        filename: correctedFileName, // Используем исправленное имя файла
        contentType: file.mimetype
      });
      console.log('FormData created successfully with corrected filename:', correctedFileName);
    } catch (formDataError: any) {
      console.error('Error creating FormData:', formDataError);
      return res.status(500).json({ 
        message: 'Ошибка при подготовке файла для загрузки',
        details: formDataError.message
      });
    }

    const url = `${EXTERNAL_API_URL}/files/`;

    console.log('Sending request to external API:', {
      url,
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token.substring(0, 20)}...` // Скрываем полный токен
      },
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024
    });

    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      timeout: 30000, // 30 секунд таймаут
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024 // 50MB
    });

    console.log('File uploaded successfully:', {
      status: response.status,
      data: response.data
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error uploading file:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : null
    });

    if (error.response) {
      console.error('External API error:', error.response.status, error.response.data);
      res.status(error.response.status).json({
        message: 'Ошибка внешнего API',
        details: error.response.data,
        status: error.response.status
      });
    } else if (error.code === 'ECONNABORTED') {
      console.error('Request timeout');
      res.status(408).json({ message: 'Превышено время ожидания загрузки файла' });
    } else {
      console.error('Network or other error:', error.message);
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

    const response = await axios.get(`${EXTERNAL_API_URL}/files/${fileId}`, {
      headers: createAuthHeaders(getAuthToken(req))
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error getting file metadata:', error);
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
    const { userId, positionName, groupName } = (req as any).token;

    // Проверяем доступ к jurists/safety
    const hasAccess = await checkSafetyJournalAccess(userId, positionName, groupName);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Недостаточно прав для удаления файла' });
    }

    const response = await axios.delete(`${EXTERNAL_API_URL}/files/${fileId}`, {
      headers: createAuthHeaders(getAuthToken(req))
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Error deleting file:', error);
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
    const branchesResponse = await axios.get(`${EXTERNAL_API_URL}/me/branches_with_journals`, {
      headers: createAuthHeaders(token)
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
    console.error('Error testing external API:', error);
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
    console.error('Error getting journal files:', error);
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
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }
    
    const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'http://10.0.128.95:8000/api/v1';
    
    const fileUrl = `${EXTERNAL_API_URL}/files/${fileId}/view`;
    
    // Сначала проверим, доступен ли файл (без stream)
    try {
      const testResponse = await axios.get(fileUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (testError: any) {
      throw testError;
    }
    
    // Если тест прошел, получаем файл как stream
    const response = await axios.get(fileUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'stream'
    });
    
    // Устанавливаем заголовки для просмотра файла
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/octet-stream',
      'Content-Disposition': response.headers['content-disposition'] || 'inline',
      'Content-Length': response.headers['content-length']
    });
    
    response.data.pipe(res);
  } catch (error: any) {
    console.error('Error viewing file:', error.message);
    if (error.response) {
      console.error('External API error response:', {
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
    const token = getAuthToken(req);
    
    if (!token) {
      return res.status(401).json({ message: 'Токен авторизации не найден' });
    }
    
    if (!fileId) {
      return res.status(400).json({ message: 'ID файла не предоставлен' });
    }
    
    const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || 'http://10.0.128.95:8000/api/v1';
    
    // Перенаправляем запрос на внешний API
    const response = await axios.get(`${EXTERNAL_API_URL}/files/${fileId}/download`, {
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
    console.error('Error downloading file:', error);
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
        `${EXTERNAL_API_URL}/branch_journals/${branchJournalId}/decision`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      res.json({ 
        message: `Журнал ${status === 'approved' ? 'одобрен' : status === 'rejected' ? 'отклонен' : 'возвращен на рассмотрение'}`,
        branchJournalId,
        status,
        updatedAt: new Date().toISOString(),
        externalResponse: externalResponse.data
      });

    } catch (externalError: any) {
      console.error('Error calling external API:', {
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
    console.error('Error making branch journal decision:', error);
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
      timeout: 30000
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
    console.error('Error proxying file:', error);
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
