import { useEffect, useRef, useState } from 'react';
import { useUserContext } from '../hooks/useUserContext';
import { APIWebSocket } from '../config/constants';

export const useWebSocket = () => {
  const { user } = useUserContext();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const connectionId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Закрываем предыдущее соединение
    if (wsRef.current) {
      console.log(`[WS] Closing previous connection (${connectionId.current})`);
      wsRef.current.close(1000, "Reconnecting");
    }

    // Генерируем новый CID
    connectionId.current = `cid_${Date.now()}`;
    const currentConnectionId = connectionId.current;

    const wsUrl = `${APIWebSocket}?userId=${user.id}&cid=${currentConnectionId}`;
    console.log(`[WS] Connecting (${currentConnectionId})...`);
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      if (connectionId.current !== currentConnectionId) {
        wsRef.current?.close();
        return;
      }
      console.log(`[WS] Connected (${currentConnectionId})`);
      setIsConnected(true);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.event === 'notification') {
          console.log('WS notification:', message.data);
          setLastMessage(message); // Сохраняем весь объект с event и data
        }
      } catch (err) {
        console.error('WS message error:', err);
      }
    };

    wsRef.current.onclose = (event) => {
      if (connectionId.current !== currentConnectionId) return;
      console.log(`[WS] Disconnected (${currentConnectionId})`, event.code);
      setIsConnected(false);
    };

    wsRef.current.onerror = (error) => {
      console.error(`[WS] Error (${currentConnectionId}):`, error);
    };

    return () => {
      if (wsRef.current && connectionId.current === currentConnectionId) {
        console.log(`[WS] Cleanup (${currentConnectionId})`);
        wsRef.current.close(1000, 'Component unmount');
        wsRef.current = null;
      }
    };
  }, [user?.id]);

  return { isConnected, lastMessage };
};