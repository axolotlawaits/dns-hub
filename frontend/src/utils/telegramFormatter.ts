/**
 * Форматирование описания для отображения на сайте/в превью
 * - поддерживает как HTML из Tiptap, так и простой текст с переносами строк
 * - все переносы (\\n, <p>, <br>) приводятся к визуальным <br>
 */
export function formatDescriptionForTelegram(description: string): string {
  if (!description) return '';

  let html = description.replace(/\r\n/g, '\n').trim();

  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(html);

  if (hasHtmlTags) {
    // 1. Приводим <strong>/<em> к <b>/<i>
    html = html.replace(/<strong>/gi, '<b>');
    html = html.replace(/<\/strong>/gi, '</b>');
    html = html.replace(/<em>/gi, '<i>');
    html = html.replace(/<\/em>/gi, '</i>');

    // 2. </p> -> <br>, <p> убираем
    html = html.replace(/<\/p>/gi, '<br>');
    html = html.replace(/<p[^>]*>/gi, '');

    // 3. Нормализуем <br>
    html = html.replace(/<br\s*\/?>/gi, '<br>');
  } else {
    // Простой текст: заменяем \n на <br>
    html = html.replace(/\n/g, '<br>');
  }

  // На всякий случай конвертируем оставшиеся \n в <br>
  html = html.replace(/\n/g, '<br>');
  return html.trim();
}

