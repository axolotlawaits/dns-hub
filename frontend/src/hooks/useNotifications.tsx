import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { APIWebSocket } from '../config/constants';
import { notificationSystem } from '../utils/Push';

type NotificationType = 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' | 'ALERT' | 'SYSTEM' | 'EVENT';

interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read?: boolean;
  action?: {
    redirectTo?: string;
    [key: string]: unknown;
  };
}

// Функция для воспроизведения звука уведомления
const playNotificationSound = async () => {
  try {
    // Проверяем настройку звука из localStorage
    const soundEnabled = localStorage.getItem('notificationSoundEnabled') !== 'false';
    const selectedSound = localStorage.getItem('notificationSound') || 'default';
    
    if (!soundEnabled) return;
    
    // Создаем AudioContext для воспроизведения звука
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Генерируем простой звуковой сигнал
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Настройки звука в зависимости от типа
    switch (selectedSound) {
      case 'gentle':
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
        break;
      case 'classic':
        oscillator.frequency.value = 1000;
        oscillator.type = 'square';
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
        break;
      case 'modern':
        // Два тона для современного звука
        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        const gain2 = audioContext.createGain();
        
        osc1.frequency.value = 800;
        osc2.frequency.value = 1000;
        osc1.type = 'sine';
        osc2.type = 'sine';
        
        osc1.connect(gain1);
        osc2.connect(gain2);
        gain1.connect(audioContext.destination);
        gain2.connect(audioContext.destination);
        
        gain1.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        osc1.start(audioContext.currentTime);
        osc2.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.4);
        osc2.stop(audioContext.currentTime + 0.4);
        return;
      default:
        oscillator.frequency.value = 600;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.25);
    }
  } catch (error) {
    console.error('Ошибка воспроизведения звука:', error);
  }
};

export const useNotifications = (userId: string) => {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId) return;

    const connectSocket = () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      socketRef.current = io(APIWebSocket, {
        query: { userId },
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true
      });

      const socket = socketRef.current;

      socket.on('notification', (message) => {
        setLastMessage({ event: 'notification', data: message });
      });

      socket.on('browser_push', (message) => {
        setLastMessage({ event: 'browser_push', data: message });
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.off();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!lastMessage) return;

    const handleNotification = (data: NotificationData) => {
      // Показываем только непрочитанные уведомления
      if (data.read === true) {
        return;
      }

      // Воспроизводим звук уведомления
      playNotificationSound();

      // Используем универсальный push для показа уведомления
      const { type, title } = data;
      const message = data.message as string | object | unknown;
      
      // КРИТИЧНО: Гарантируем, что message - это строка
      let messageText = '';
      if (typeof message === 'string') {
        messageText = message;
      } else if (message && typeof message === 'object') {
        // Если message - это объект, пытаемся извлечь строку
        const msgObj = message as Record<string, unknown>;
        if ('message' in msgObj && typeof msgObj.message === 'string') {
          messageText = msgObj.message;
        } else if ('text' in msgObj && typeof msgObj.text === 'string') {
          messageText = msgObj.text;
        } else {
          console.error('[useNotifications] message is an object without string field:', message);
          messageText = '[Invalid message format]';
        }
      } else {
        messageText = String(message || '');
      }
      
      // Преобразуем тип уведомления для универсального push
      let pushType: 'info' | 'error' | 'warning' | 'success' = 'info';
      switch (type) {
        case 'SUCCESS':
          pushType = 'success';
          break;
        case 'ERROR':
          pushType = 'error';
          break;
        case 'WARNING':
        case 'ALERT':
          pushType = 'warning';
          break;
        default:
          pushType = 'info';
      }

      // Показываем уведомление через универсальный push
      notificationSystem.addNotification(
        typeof title === 'string' ? title : String(title || ''),
        messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText,
        pushType
      );
    };

    if (lastMessage.event === 'notification') {
      handleNotification(lastMessage.data);
    }

    if (lastMessage.event === 'browser_push') {
      // Для browser_push проверяем read статус, если он есть
      // КРИТИЧНО: Гарантируем, что body - это строка
      let bodyText = '';
      if (typeof lastMessage.data.body === 'string') {
        bodyText = lastMessage.data.body;
      } else if (lastMessage.data.body && typeof lastMessage.data.body === 'object') {
        // Если body - это объект, пытаемся извлечь строку
        if ('message' in lastMessage.data.body && typeof lastMessage.data.body.message === 'string') {
          bodyText = lastMessage.data.body.message;
        } else {
          console.error('[useNotifications] browser_push body is an object without string field:', lastMessage.data.body);
          bodyText = '[Invalid message format]';
        }
      } else {
        bodyText = String(lastMessage.data.body || '');
      }
      
      const notificationData: NotificationData = {
        id: lastMessage.data.id,
        type: lastMessage.data.type,
        title: typeof lastMessage.data.title === 'string' ? lastMessage.data.title : String(lastMessage.data.title || ''),
        message: bodyText,
        read: lastMessage.data.read,
        action: lastMessage.data.data,
      };
      
      handleNotification(notificationData);
    }
  }, [lastMessage]);
};