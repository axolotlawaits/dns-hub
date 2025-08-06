import { useEffect, useRef, useState } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { io, Socket } from 'socket.io-client';
import { APIWebSocket } from '../config/constants';

export const useSocketIO = () => {
  const { user } = useUserContext();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Закрываем предыдущее соединение
    if (socketRef.current) {
      console.log(`[Socket.IO] Closing previous connection`);
      socketRef.current.disconnect();
    }

    const socketUrl = APIWebSocket;
    console.log(`[Socket.IO] Connecting...`);
    
    socketRef.current = io(socketUrl, {
      query: { userId: user.id },
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log(`[Socket.IO] Connected`);
      setIsConnected(true);
    });

    socketRef.current.on('connection_ack', (data) => {
      console.log('[Socket.IO] Connection acknowledged:', data);
    });

    socketRef.current.on('notification', (message) => {
      console.log('Socket.IO notification:', message);
      setLastNotification(message);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Disconnected:`, reason);
      setIsConnected(false);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error(`[Socket.IO] Connection error:`, err);
    });

    return () => {
      if (socketRef.current) {
        console.log(`[Socket.IO] Cleanup`);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?.id]);

  return { isConnected, lastNotification };
};