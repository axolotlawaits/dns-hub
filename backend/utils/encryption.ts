import crypto from 'crypto';

// Используем AES-256-GCM для аутентифицированного шифрования
// GCM обеспечивает конфиденциальность, целостность и аутентификацию данных
const algorithm = 'aes-256-gcm';
const ivLength = 12; // 12 bytes для GCM (рекомендуется)
const authTagLength = 16; // 16 bytes для тега аутентификации
const saltLength = 32; // 32 bytes для соли (для дополнительной защиты)

// Кэш для ключей шифрования (версия -> ключ)
const encryptionKeysCache = new Map<number, Buffer>();

// Получение ключа шифрования по версии
const getEncryptionKeyByVersion = (version: number): Buffer => {
  // Проверяем кэш
  if (encryptionKeysCache.has(version)) {
    return encryptionKeysCache.get(version)!;
  }

  let key: string | undefined;
  
  if (version === 0) {
    // Версия 0 - текущий ключ (ENCRYPTION_KEY)
    key = process.env.ENCRYPTION_KEY;
  } else {
    // Старые ключи (ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, ...)
    key = process.env[`ENCRYPTION_KEY_V${version}`];
  }

  if (!key) {
    throw new Error(`ENCRYPTION_KEY${version === 0 ? '' : `_V${version}`} environment variable is not set.`);
  }

  // Key must be 32 bytes for AES-256. Assuming it's provided as a hex string.
  const bufferKey = Buffer.from(key, 'hex');
  if (bufferKey.length !== 32) {
    throw new Error(`ENCRYPTION_KEY${version === 0 ? '' : `_V${version}`} must be a 32-byte (64-character hex) string.`);
  }

  // Кэшируем ключ
  encryptionKeysCache.set(version, bufferKey);
  return bufferKey;
};

// Получение текущего (активного) ключа шифрования
const getEncryptionKey = (): Buffer => {
  return getEncryptionKeyByVersion(0);
};

// Получение текущей версии ключа (всегда 0 для новых данных)
const getCurrentKeyVersion = (): number => {
  return 0;
};

// Поиск всех доступных версий ключей
const getAvailableKeyVersions = (): number[] => {
  const versions: number[] = [0]; // Текущий ключ всегда доступен
  
  // Проверяем старые ключи (V1, V2, V3, ...)
  let version = 1;
  while (process.env[`ENCRYPTION_KEY_V${version}`]) {
    versions.push(version);
    version++;
  }
  
  return versions;
};

// Получение ключа для HMAC (дополнительная защита целостности)
// Используем производный ключ из основного ключа шифрования
const getHmacKey = (keyVersion: number = 0): Buffer => {
  const encryptionKey = getEncryptionKeyByVersion(keyVersion);
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
 * Формат: keyVersion:salt:iv:authTag:encryptedData:hmac
 * @param text - Текст для шифрования
 * @returns Зашифрованная строка в формате hex
 */
export const encrypt = (text: string): string => {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  try {
    const keyVersion = getCurrentKeyVersion();
    const key = getEncryptionKeyByVersion(keyVersion);
    const hmacKey = getHmacKey(keyVersion);
    
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
    // Включаем версию ключа, соль, IV, тег и зашифрованные данные
    const hmacData = `${keyVersion}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    const hmac = crypto.createHmac('sha256', hmacKey)
      .update(hmacData)
      .digest('hex');
    
    // Формат: keyVersion:salt:iv:authTag:encryptedData:hmac
    const result = `${keyVersion}:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}:${hmac}`;
    
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
 * Поддерживает ротацию ключей - автоматически пробует все доступные версии ключей
 * @param encryptedText - Зашифрованная строка в формате hex
 * @returns Расшифрованный текст и версию ключа (для миграции)
 */
export const decrypt = (encryptedText: string): string => {
  if (!encryptedText || typeof encryptedText !== 'string') {
    throw new Error('Invalid input: encryptedText must be a non-empty string');
  }

  const parts = encryptedText.split(':');
  
  // Поддержка старого формата (для обратной совместимости)
  if (parts.length === 2) {
    // Старый формат CBC: iv:encrypted
    throw new Error('Legacy encryption format detected. Please re-encrypt the data.');
  }
  
  // Определяем формат: новый (6 частей) или старый (5 частей)
  let keyVersion: number;
  let saltHex: string, ivHex: string, authTagHex: string, encryptedData: string, receivedHmac: string;
  
  if (parts.length === 6) {
    // Новый формат с версией ключа: keyVersion:salt:iv:authTag:encryptedData:hmac
    const [keyVersionStr, saltHexPart, ivHexPart, authTagHexPart, encryptedDataPart, receivedHmacPart] = parts;
    keyVersion = parseInt(keyVersionStr, 10);
    if (isNaN(keyVersion)) {
      throw new Error('Invalid key version in encrypted data');
    }
    saltHex = saltHexPart;
    ivHex = ivHexPart;
    authTagHex = authTagHexPart;
    encryptedData = encryptedDataPart;
    receivedHmac = receivedHmacPart;
  } else if (parts.length === 5) {
    // Старый формат без версии: salt:iv:authTag:encryptedData:hmac (версия 0)
    [saltHex, ivHex, authTagHex, encryptedData, receivedHmac] = parts;
    keyVersion = 0; // По умолчанию версия 0
  } else {
    throw new Error('Invalid encrypted text format: expected 5 or 6 parts');
  }
  
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
  
  // Пробуем расшифровать с указанной версией ключа, если не получается - пробуем другие
  const availableVersions = getAvailableKeyVersions();
  const versionsToTry = [keyVersion, ...availableVersions.filter(v => v !== keyVersion)];
  
  let lastError: Error | null = null;
  
  for (const versionToTry of versionsToTry) {
    try {
      const key = getEncryptionKeyByVersion(versionToTry);
      const hmacKey = getHmacKey(versionToTry);
      
      // Проверяем HMAC перед расшифровкой
      const hmacData = parts.length === 6 
        ? `${versionToTry}:${saltHex}:${ivHex}:${authTagHex}:${encryptedData}`
        : `${saltHex}:${ivHex}:${authTagHex}:${encryptedData}`;
      const calculatedHmac = crypto.createHmac('sha256', hmacKey)
        .update(hmacData)
        .digest('hex');
      
      // Безопасное сравнение HMAC (защита от timing attacks)
      if (!secureCompare(Buffer.from(calculatedHmac, 'hex'), Buffer.from(receivedHmac, 'hex'))) {
        lastError = new Error('HMAC verification failed');
        continue;
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
      lastError = error;
      continue;
    }
  }
  
  // Если не удалось расшифровать ни одним ключом
  if (lastError?.message.includes('HMAC') || lastError?.message.includes('integrity')) {
    throw new Error('Decryption failed: data integrity verification failed');
  }
  throw new Error('Decryption failed: invalid encrypted data or key not found');
};

/**
 * Проверяет, нужно ли перешифровать данные (используется старый ключ)
 * @param encryptedText - Зашифрованная строка
 * @returns true если нужно перешифровать, false если используется текущий ключ
 */
export const needsReencryption = (encryptedText: string): boolean => {
  try {
    const parts = encryptedText.split(':');
    
    // Старый формат без версии - нужно перешифровать
    if (parts.length === 5) {
      return true;
    }
    
    // Новый формат с версией
    if (parts.length === 6) {
      const keyVersion = parseInt(parts[0], 10);
      const currentVersion = getCurrentKeyVersion();
      return keyVersion !== currentVersion;
    }
    
    return false;
  } catch {
    return false;
  }
};

