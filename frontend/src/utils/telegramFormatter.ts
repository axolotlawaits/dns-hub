/**
 * Минимальное форматирование HTML для отображения на сайте
 * Просто возвращаем HTML как есть - браузер сам его отобразит
 */
export function formatDescriptionForTelegram(description: string): string {
  if (!description) return '';
  return description.trim();
}

