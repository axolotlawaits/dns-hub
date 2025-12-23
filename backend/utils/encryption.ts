import crypto from 'crypto';

// Используем AES-256-GCM для аутентифицированного шифрования
// GCM обеспечивает конфиденциальность, целостность и аутентификацию данных
const algorithm = 'aes-256-gcm';
const ivLength = 12; // 12 bytes для GCM (рекомендуется)
const authTagLength = 16; // 16 bytes для тега аутентификации
const saltLength = 32; // 32 bytes для соли (для дополнительной защиты)

// Получение ключа шифрования из переменной окружения
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set.');
  }
  // Key must be 32 bytes for AES-256. Assuming it's provided as a hex string.
  const bufferKey = Buffer.from(key, 'hex');
  if (bufferKey.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte (64-character hex) string.');
  }
  return bufferKey;
};

// Получение ключа для HMAC (дополнительная защита целостности)
// Используем производный ключ из основного ключа шифрования
const getHmacKey = (): Buffer => {
  const encryptionKey = getEncryptionKey();
  // Создаем производный ключ для HMAC используя HKDF
  const hmacKey = crypto.createHmac('sha256', Buffer.from('HMAC_KEY_SALT', 'utf8'))
    .update(encryptionKey)
    .digest();
  return hmacKey;
};

// Безопасное сравнение буферов (защита от timing attacks)
const secureCompare = (a: Buffer, b: Buffer): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
};

// Безопасное сравнение строк (защита от timing attacks)
export const secureStringCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

// Очистка чувствительных данных из памяти
const secureClear = (buffer: Buffer | string): void => {
  if (Buffer.isBuffer(buffer)) {
    buffer.fill(0);
  }
  // Для строк в JavaScript мы не можем гарантировать очистку из памяти,
  // но можем попытаться минимизировать время жизни
};

/**
 * Шифрование текста с использованием AES-256-GCM
 * Формат: salt:iv:authTag:encryptedData:hmac
 * @param text - Текст для шифрования
 * @returns Зашифрованная строка в формате hex
 */
export const encrypt = (text: string): string => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const hmacKey = getHmacKey();
    
    // Генерируем случайную соль для дополнительной защиты
    const salt = crypto.randomBytes(saltLength);
    
    // Генерируем случайный IV
    const iv = crypto.randomBytes(ivLength);
    
    // Создаем cipher с GCM режимом
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    // Шифруем данные
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Получаем тег аутентификации (автоматически генерируется в GCM)
    const authTag = cipher.getAuthTag();
    
    // Создаем HMAC для дополнительной проверки целостности
    // Включаем соль, IV, тег и зашифрованные данные
    const hmacData = salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    const hmac = crypto.createHmac('sha256', hmacKey)
      .update(hmacData)
      .digest('hex');
    
    // Формат: salt:iv:authTag:encryptedData:hmac
    const result = `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}:${hmac}`;
    
    // Очищаем чувствительные данные из памяти
    secureClear(key);
    secureClear(hmacKey);
    secureClear(salt);
    secureClear(iv);
    
    return result;
  } catch (error: any) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
};

/**
 * Расшифровка текста с проверкой целостности
 * @param encryptedText - Зашифрованная строка в формате hex
 * @returns Расшифрованный текст
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('Invalid input: encryptedText must be a non-empty string');
  }

  try {
    const key = getEncryptionKey();
    const hmacKey = getHmacKey();
    
    // Парсим формат: salt:iv:authTag:encryptedData:hmac
    const parts = encryptedText.split(':');
    
    // Поддержка старого формата (для обратной совместимости)
    if (parts.length === 2) {
      // Старый формат CBC: iv:encrypted
      throw new Error('Legacy encryption format detected. Please re-encrypt the data.');
    }
    
    if (parts.length !== 5) {
      throw new Error('Invalid encrypted text format: expected 5 parts (salt:iv:authTag:encryptedData:hmac)');
    }
    
    const [saltHex, ivHex, authTagHex, encryptedData, receivedHmac] = parts;
    
    // Проверяем формат hex
    if (!/^[0-9a-f]+$/i.test(saltHex + ivHex + authTagHex + encryptedData + receivedHmac)) {
      throw new Error('Invalid hex format in encrypted data');
    }
    
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Проверяем размеры
    if (salt.length !== saltLength) {
      throw new Error(`Invalid salt length: expected ${saltLength}, got ${salt.length}`);
    }
    if (iv.length !== ivLength) {
      throw new Error(`Invalid IV length: expected ${ivLength}, got ${iv.length}`);
    }
    if (authTag.length !== authTagLength) {
      throw new Error(`Invalid auth tag length: expected ${authTagLength}, got ${authTag.length}`);
    }
    
    // Проверяем HMAC перед расшифровкой
    const hmacData = saltHex + ':' + ivHex + ':' + authTagHex + ':' + encryptedData;
    const calculatedHmac = crypto.createHmac('sha256', hmacKey)
      .update(hmacData)
      .digest('hex');
    
    // Безопасное сравнение HMAC (защита от timing attacks)
    if (!secureCompare(Buffer.from(calculatedHmac, 'hex'), Buffer.from(receivedHmac, 'hex'))) {
      throw new Error('HMAC verification failed: data integrity check failed');
    }
    
    // Создаем decipher с GCM режимом
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    // Устанавливаем тег аутентификации
    decipher.setAuthTag(authTag);
    
    // Расшифровываем данные
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Очищаем чувствительные данные из памяти
    secureClear(key);
    secureClear(hmacKey);
    secureClear(salt);
    secureClear(iv);
    secureClear(authTag);
    
    return decrypted;
  } catch (error: any) {
    // Не раскрываем детали ошибки для безопасности
    if (error.message.includes('HMAC') || error.message.includes('integrity')) {
      throw new Error('Decryption failed: data integrity verification failed');
    }
    if (error.message.includes('Legacy')) {
      throw error; // Пробрасываем ошибку о старом формате
    }
    throw new Error('Decryption failed: invalid encrypted data');
  }
};

