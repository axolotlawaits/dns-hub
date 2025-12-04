import { useEffect, useRef, useState } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { io, Socket } from 'socket.io-client';
import { APIWebSocket } from '../config/constants';

export const useSocketIO = () => {
  const { user } = useUserContext();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;

    const connectSocket = () => {
      // Закрываем предыдущее соединение
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      console.log(`[Socket.IO] Connecting to ${APIWebSocket}`);
      
      socketRef.current = io(APIWebSocket, {
        query: { userId: user.id },
        path: '/socket.io',
        transports: ['websocket'], // Используем только WebSocket
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true
      });

      // Обработчики событий
      const socket = socketRef.current;

      socket.on('connect', () => {
        console.log(`[Socket.IO] Connected with ID: ${socket.id}`);
        setIsConnected(true);
      });

      socket.on('connection_ack', (data) => {
        console.log('[Socket.IO] Connection acknowledged:', data);
      });

      socket.on('notification', (message) => {
        console.log('[Socket.IO] New notification:', message);
        setLastNotification(message);
      });

      socket.on('system_metrics', (metrics) => {
        console.log('[Socket.IO] System metrics received:', metrics);
        setSystemMetrics(metrics);
      });

      socket.on('disconnect', (reason) => {
        console.log(`[Socket.IO] Disconnected: ${reason}`);
        setIsConnected(false);
        
        if (reason === 'io server disconnect') {
          // Переподключение при принудительном отключении сервером
          setTimeout(() => socket.connect(), 1000);
        }
      });

      socket.on('connect_error', (err) => {
        console.error(`[Socket.IO] Connection error:`, err.message);
        setIsConnected(false);
      });

      socket.on('error', (err) => {
        console.error(`[Socket.IO] Error:`, err);
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        console.log(`[Socket.IO] Cleaning up connection`);
        socketRef.current.off(); // Удаляем все обработчики
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
    };
  }, [user?.id]);

  return { isConnected, lastNotification, systemMetrics };
};