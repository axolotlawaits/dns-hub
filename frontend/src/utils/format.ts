

/**
 * Декодирует русские символы в названиях файлов, исправляя проблемы с кодировкой
 * @param fileName - название файла, которое может содержать искаженные русские символы
 * @returns исправленное название файла
 */
export const decodeRussianFileName = (fileName: string): string => {
  if (!fileName) return fileName;
  
  try {
    // Если строка содержит искаженные русские символы, пытаемся их исправить
    if (fileName.includes('Ð') || fileName.includes('Ñ')) {
      // Используем TextDecoder для декодирования из latin1 в utf8 (браузерная альтернатива Buffer)
      const decoder = new TextDecoder('utf-8');
      
      // Кодируем строку как latin1, затем декодируем как utf8
      const latin1Bytes = new Uint8Array(fileName.length);
      for (let i = 0; i < fileName.length; i++) {
        latin1Bytes[i] = fileName.charCodeAt(i);
      }
      
      const decoded = decoder.decode(latin1Bytes);
      return decoded;
    }
    return fileName;
  } catch (error) {
    console.warn('Could not decode file name:', error);
    return fileName;
  }
};

export const formatName = (name: string): string => {
  const nameArray = name.split(' ');
  if (nameArray.length === 1) {
    return nameArray[0];
  }
  if (nameArray.length === 2) {
    return `${nameArray[0]} ${nameArray[1][0]}.`;
  }
  return `${nameArray[0]} ${nameArray[1][0]}.${nameArray[2][0]}.`;
};

  
  export const truncateText = (text: string, maxLength: number): string => {
    const plainText = text.replace(/<[^>]*>/g, '');
    if (plainText.length <= maxLength) return plainText;
  
    // Обрезаем до maxLength символов
    let truncated = plainText.substring(0, maxLength);
    
    // Находим последний пробел в обрезанной строке
    const lastSpaceIndex = truncated.lastIndexOf(' ');
    
    // Если пробел найден и он не первый символ
    if (lastSpaceIndex > 0 && lastSpaceIndex < maxLength) {
      truncated = plainText.substring(0, lastSpaceIndex);
    }
    
    // Убеждаемся, что длина с многоточием не превышает maxLength
    const ellipsis = '...';
    const finalLength = truncated.length + ellipsis.length;
    if (finalLength > maxLength) {
      // Если места мало, обрезаем до maxLength - 3
      truncated = plainText.substring(0, maxLength - ellipsis.length);
    }
    
    return `${truncated}${ellipsis}`;
  };

  // format.ts
export const formatPrice = (price: number | string): string => {
  // Преобразуем в число, если передана строка
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  // Форматируем число с разделителями тысяч и двумя знаками после запятой
  const formatted = numericPrice.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // Добавляем символ рубля
  return `${formatted} ₽`;
};

export const formatValue = (key: string, value: number): string => {
  if (key.includes('Электричество')) {
    return `${value} кВт·ч`;
  }
  if (key.includes('вода')) {
    return `${value} м³`;
  }
  return value.toString();
};

/**
 * Форматирует название папки месяца из формата "12-2025" в "Декабрь 2025"
 * @param folderName - название папки в формате "MM-YYYY" или пустая строка
 * @returns отформатированное название или "текущий месяц" если пусто
 */
export const formatMonthFolder = (folderName: string): string => {
  if (!folderName) return 'текущий месяц';
  const parts = folderName.split('-');
  if (parts.length !== 2) return folderName;
  
  const month = parseInt(parts[0], 10);
  const year = parts[1];
  
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  
  if (month >= 1 && month <= 12) {
    return `${monthNames[month - 1]} ${year}`;
  }
  
  return folderName;
};