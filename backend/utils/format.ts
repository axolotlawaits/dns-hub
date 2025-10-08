/**
 * Утилиты для форматирования данных
 */

/**
 * Декодирует русские символы в названиях файлов, исправляя проблемы с кодировкой
 * @param fileName - название файла, которое может содержать искаженные русские символы
 * @returns исправленное название файла
 */
export const decodeRussianFileName = (fileName: string): string => {
  if (!fileName) return fileName;
  
  try {
    // Проверяем на наличие искаженных русских символов (mojibake)
    if (/Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ|Ð|Ñ/.test(fileName)) {
      // Декодируем из latin1 в utf8
      const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
      return decoded;
    }
    return fileName;
  } catch (error) {
    console.warn('Could not decode file name:', error);
    return fileName;
  }
};
