// url.ts
import { IconLock, IconAlertTriangle } from '@tabler/icons-react';

export const normalizeUrl = (url: string): string => {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^partner\.ru/i.test(url)) return `http://${url}`;
  return `https://${url}`;
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(normalizeUrl(url));
    return true;
  } catch {
    return false;
  }
};

export const isSecureUrl = (url: string) => {
  if (url.includes('partner.ru')) {
    return { icon: <IconLock size={16} color="green" />, message: 'Безопасное соединение' };
  }
  if (url.startsWith('https://')) {
    return { icon: <IconLock size={16} color="green" />, message: 'Безопасное соединение' };
  } else if (url.startsWith('http://')) {
    return { icon: <IconAlertTriangle size={16} color="red" />, message: 'Небезопасное соединение' };
  }
  return { icon: null, message: '' };
};

export const getPreviewUrl = (url: string): string => {
  return `https://api.screenshotmachine.com?key=72a64b&url=${encodeURIComponent(url)}&dimension=1024x576`;
};