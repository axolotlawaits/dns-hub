import { API } from '../config/constants';
import { notificationSystem } from './Push';

/**
 * Универсальная функция для обработки ошибок API
 */
export const handleApiError = (error: unknown, defaultMessage: string): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as { error?: string | object; message?: string };
    if (typeof errorObj.error === 'string') {
      return errorObj.error;
    }
    if (typeof errorObj.error === 'object') {
      return JSON.stringify(errorObj.error);
    }
    if (errorObj.message) {
      return errorObj.message;
    }
  }
  return defaultMessage;
};

/**
 * Универсальная функция для выполнения API запросов с обработкой ошибок
 */
export const apiRequest = async <T = any>(
  endpoint: string,
  options: RequestInit = {},
  showNotifications: boolean = true
): Promise<{ success: boolean; data?: T; error?: string }> => {
  try {
    const token = localStorage.getItem('token');
    const headers = new Headers(options.headers);
    
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API}${endpoint}`, {
      ...options,
      headers,
    });

    const json = await response.json();

    if (response.ok) {
      return { success: true, data: json };
    } else {
      const errorMessage = handleApiError(json, 'Произошла ошибка');
      if (showNotifications) {
        notificationSystem.addNotification('Ошибка', errorMessage, 'error');
      }
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    const errorMessage = handleApiError(error, 'Ошибка соединения с сервером');
    if (showNotifications) {
      notificationSystem.addNotification('Ошибка', errorMessage, 'error');
    }
    return { success: false, error: errorMessage };
  }
};

/**
 * Универсальная функция для успешных операций
 */
export const showSuccessNotification = (message: string, title: string = 'Успех') => {
  notificationSystem.addNotification(title, message, 'success');
};

/**
 * Универсальная функция для операций с подтверждением
 */
export const showWarningNotification = (message: string, title: string = 'Предупреждение') => {
  notificationSystem.addNotification(title, message, 'warning');
};
