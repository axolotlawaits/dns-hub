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