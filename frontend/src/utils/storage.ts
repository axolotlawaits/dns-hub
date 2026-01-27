/**
 * Утилиты для работы с localStorage
 */

/**
 * Очищает все данные пользователя из localStorage
 */
export const clearUserStorage = (): void => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  localStorage.removeItem('domain');
};

/**
 * Очищает данные администратора из localStorage
 */
export const clearAdminStorage = (): void => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
};

/**
 * Очищает все данные аутентификации из localStorage
 */
export const clearAllAuthStorage = (): void => {
  clearUserStorage();
  clearAdminStorage();
};
