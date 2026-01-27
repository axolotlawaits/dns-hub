import { Server } from 'socket.io';
import { createServer } from 'http';
import { prisma } from './server.js';

type ConnectionInfo = {
  userId?: string;
  deviceId?: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  activeChatId?: string; // ID активного чата для пользователя
};

export class SocketIOService {
  private static instance: SocketIOService;
  private io: Server | null = null;
  private connections = new Map<string, ConnectionInfo>(); // key: socketId
  private deviceToSockets = new Map<string, Set<string>>(); // deviceId -> socketIds
  private userToSockets = new Map<string, Set<string>>(); // userId -> socketIds

  public static getInstance(): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService();
    }
    return SocketIOService.instance;
  }

  public initialize(server: ReturnType<typeof createServer>): void {
    if (this.io) {
      console.warn('[Socket.IO] Server already initialized');
      return;
    }

    this.io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://dns-zs.partner.ru', 'http://10.11.145.196'] 
          : ['http://localhost:5173', 'http://10.11.145.196'],
        methods: ["GET", "POST"],
        credentials: true
      },
      path: '/socket.io',
      transports: ['websocket', 'polling'], // сохраняем polling для старых клиентов уведомлений
      pingTimeout: 60000,
      pingInterval: 25000,
      cookie: false,
      allowEIO3: true,
      serveClient: false,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true
      }
    });

    this.setupConnectionHandlers();
    this.setupCleanupInterval();
  }

  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      const rawUser = (socket.handshake.query.userId || '') as string;
      const rawDevice = (socket.handshake.query.deviceId || '') as string;
      const userId = String(rawUser || '').trim();
      const deviceId = String(rawDevice || '').trim();

      if (!userId && !deviceId) {
        console.warn('[Socket.IO] Connection attempt without userId/deviceId');
        socket.disconnect(true);
        return;
      }

      this.registerSocket({ userId: userId || undefined, deviceId: deviceId || undefined, socketId: socket.id });

      socket.emit('connection_ack', {
        status: 'connected',
        userId: userId || null,
        deviceId: deviceId || null,
        socketId: socket.id,
        timestamp: Date.now()
      });

      socket.on('device_register', (payload: any) => {
        const did = String(payload?.deviceId || '').trim();
        if (did) this.registerDeviceSocket(did, socket.id);
      });

      socket.on('user_register', (payload: any) => {
        const uid = String(payload?.userId || '').trim();
        if (uid) this.registerUserSocket(uid, socket.id);
      });

      socket.on('pong', () => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          conn.lastActivity = new Date();
        }
      });

      socket.on('heartbeat', (payload: any) => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          conn.lastActivity = new Date();
        }
      });

      // Обработчик для установки активного чата
      socket.on('set_active_chat', (payload: { chatId?: string }) => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          conn.activeChatId = payload?.chatId || undefined;
          conn.lastActivity = new Date();
        }
      });

      // Обработчик для индикатора "печатает..."
      socket.on('user_typing', (payload: { chatId?: string; branchId?: string; typing: boolean }) => {
        const conn = this.connections.get(socket.id);
        if (!conn || !conn.userId) return;
        
        // Отправляем событие всем участникам чата, кроме отправителя
        const targetSockets = new Set<string>();
        
        // Находим всех пользователей в этом чате (через branchId или chatId)
        // Для простоты отправляем всем пользователям, которые подключены
        this.userToSockets.forEach((socketIds, userId) => {
          if (userId !== conn.userId) {
            socketIds.forEach(sid => targetSockets.add(sid));
          }
        });
        
        // Получаем имя пользователя для отправки в событии (асинхронно)
        prisma.user.findUnique({
          where: { id: conn.userId },
          select: { id: true, name: true }
        }).then(user => {
          // Отправляем событие всем участникам
          targetSockets.forEach(socketId => {
            const targetSocket = this.io?.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('user_typing', {
                userId: conn.userId,
                userName: user?.name || 'Пользователь',
                chatId: payload.chatId,
                branchId: payload.branchId,
                typing: payload.typing,
              });
            }
          });
        }).catch(() => {
          // В случае ошибки отправляем без имени
          targetSockets.forEach(socketId => {
            const targetSocket = this.io?.sockets.sockets.get(socketId);
            if (targetSocket) {
              targetSocket.emit('user_typing', {
                userId: conn.userId,
                userName: 'Пользователь',
                chatId: payload.chatId,
                branchId: payload.branchId,
                typing: payload.typing,
              });
            }
          });
        });
        
        if (conn) conn.lastActivity = new Date();
      });

      socket.onAny((eventName, ...args) => {
        const conn = this.connections.get(socket.id);
        if (conn) conn.lastActivity = new Date();
      });

      socket.on('disconnect', (reason) => {
        this.unregisterSocket(socket.id);
      });

      socket.on('error', (err) => {
        console.error(`[Socket.IO] socket error:`, err);
        this.unregisterSocket(socket.id);
      });
    });
  }

  private registerSocket(init: { userId?: string; deviceId?: string; socketId: string }) {
    const { userId, deviceId, socketId } = init;

    // Close other sockets for same deviceId (policy: 1 active per device)
    if (deviceId) {
      const existing = this.deviceToSockets.get(deviceId) || new Set<string>();
      existing.forEach((sid) => {
        if (sid !== socketId) {
          this.io?.sockets.sockets.get(sid)?.disconnect(true);
          this.connections.delete(sid);
        }
      });
      this.deviceToSockets.set(deviceId, new Set([socketId]));
    }

    if (userId) {
      const set = this.userToSockets.get(userId) || new Set<string>();
      set.add(socketId);
      this.userToSockets.set(userId, set);
    }

    const info: ConnectionInfo = {
      userId,
      deviceId,
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date()
    };
    this.connections.set(socketId, info);
  }

  private registerDeviceSocket(deviceId: string, socketId: string) {
    this.registerSocket({ deviceId, socketId });
  }

  private registerUserSocket(userId: string, socketId: string) {
    this.registerSocket({ userId, socketId });
  }

  private unregisterSocket(socketId: string) {
    const info = this.connections.get(socketId);
    if (info) {
      if (info.deviceId) {
        const set = this.deviceToSockets.get(info.deviceId);
        if (set) {
          set.delete(socketId);
          if (set.size === 0) this.deviceToSockets.delete(info.deviceId);
        }
      }
      if (info.userId) {
        const setU = this.userToSockets.get(info.userId);
        if (setU) {
          setU.delete(socketId);
          if (setU.size === 0) this.userToSockets.delete(info.userId);
        }
      }
      this.connections.delete(socketId);
    }
  }

  private setupCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn, socketId) => {
        const inactiveDuration = now - conn.lastActivity.getTime();
        if (inactiveDuration > 5 * 60 * 1000) {
          this.io?.sockets.sockets.get(socketId)?.disconnect(true);
          this.unregisterSocket(socketId);
        }
      });
    }, 60000);
  }

  public isDeviceConnected(deviceId: string): boolean {
    const set = this.deviceToSockets.get(deviceId);
    if (!set || set.size === 0) return false;
    
    const now = new Date();
    // Проверяем, есть ли активные сокеты для этого устройства
    for (const socketId of set) {
      const conn = this.connections.get(socketId);
      if (conn) {
        // Считаем устройство активным, если последняя активность была менее 2 минут назад
        const timeSinceLastActivity = now.getTime() - conn.lastActivity.getTime();
        if (timeSinceLastActivity < 2 * 60 * 1000) { // 2 минуты
          return true;
        }
      }
    }
    
    return false;
  }

  public getConnectedDeviceIds(): string[] {
    const now = new Date();
    const activeDevices: string[] = [];
    
    for (const [deviceId, socketIds] of this.deviceToSockets.entries()) {
      // Проверяем, есть ли активные сокеты для этого устройства
      let hasActiveSocket = false;
      for (const socketId of socketIds) {
        const conn = this.connections.get(socketId);
        if (conn) {
          // Считаем устройство активным, если последняя активность была менее 2 минут назад
          const timeSinceLastActivity = now.getTime() - conn.lastActivity.getTime();
          if (timeSinceLastActivity < 2 * 60 * 1000) { // 2 минуты
            hasActiveSocket = true;
            break;
          }
        }
      }
      
      if (hasActiveSocket) {
        activeDevices.push(deviceId);
      }
    }
    
    return activeDevices;
  }

  public async sendToDeviceWithAck<T = any>(deviceId: string, event: string, payload?: any, timeoutMs: number = 3000): Promise<{ ok: boolean; data?: T; error?: string }>{
    const socketIds = Array.from(this.deviceToSockets.get(deviceId) || []);
    if (socketIds.length === 0) return { ok: false, error: 'DEVICE_OFFLINE' };
    const socketId = socketIds[0];
    const socket: any = this.io?.sockets.sockets.get(socketId);
    if (!socket) return { ok: false, error: 'SOCKET_NOT_FOUND' };
    try {
      if (typeof socket.timeout === 'function' && typeof socket.emitWithAck === 'function') {
        const resp = await socket.timeout(timeoutMs).emitWithAck(event, payload ?? {});
        return { ok: true, data: resp as T };
      }
      socket.emit(event, payload ?? {});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  // Backward-compatible notifications API
  public getUserConnections(userId: string): ConnectionInfo[] {
    const sockets = Array.from(this.userToSockets.get(userId) || []);
    return sockets.map((sid) => this.connections.get(sid)).filter(Boolean) as ConnectionInfo[];
  }

  // Проверяет, находится ли пользователь в активном чате
  public isUserInActiveChat(userId: string, chatId: string): boolean {
    const conns = this.getUserConnections(userId);
    return conns.some(conn => conn.activeChatId === chatId);
  }

  // Проверяет, находится ли пользователь в любом активном чате
  public isUserInAnyActiveChat(userId: string): boolean {
    const conns = this.getUserConnections(userId);
    return conns.some(conn => conn.activeChatId !== undefined && conn.activeChatId !== null);
  }

  public sendToUser(userId: string, message: any): boolean {
    const conns = this.getUserConnections(userId);
    
    if (conns.length === 0) {
      return false;
    }
    
    let success = true;
    conns.forEach(conn => {
      try {
        this.io?.to(conn.socketId).emit('notification', {
          ...message,
          sentAt: new Date().toISOString()
        });
        conn.lastActivity = new Date();
      } catch (err) {
        console.error(`[Socket.IO] ❌ Error sending to user ${userId} socket ${conn.socketId}:`, err);
        success = false;
      }
    });
    return success;
  }

  // Отправка сообщения чата без создания уведомления
  public sendChatMessage(userId: string, message: any): boolean {
    const conns = this.getUserConnections(userId);
    
    if (conns.length === 0) {
      return false;
    }
    
    let success = true;
    conns.forEach(conn => {
      try {
        // Отправляем событие 'new_message' вместо 'notification', чтобы не создавать уведомление
        this.io?.to(conn.socketId).emit('new_message', {
          ...message,
          sentAt: new Date().toISOString()
        });
        conn.lastActivity = new Date();
      } catch (err) {
        console.error(`[Socket.IO] ❌ Error sending chat message to user ${userId} socket ${conn.socketId}:`, err);
        success = false;
      }
    });
    return success;
  }

  // Отправка произвольного события пользователю
  public sendEventToUser(userId: string, eventName: string, data: any): boolean {
    const conns = this.getUserConnections(userId);
    
    if (conns.length === 0) {
      return false;
    }
    
    let success = true;
    conns.forEach(conn => {
      try {
        this.io?.to(conn.socketId).emit(eventName, {
          ...data,
          sentAt: new Date().toISOString()
        });
        conn.lastActivity = new Date();
      } catch (err) {
        console.error(`[Socket.IO] ❌ Error sending event ${eventName} to user ${userId} socket ${conn.socketId}:`, err);
        success = false;
      }
    });
    return success;
  }


  public getConnectedUsers(): string[] {
    return Array.from(this.userToSockets.keys());
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }

  // Device ping with ack fallback
  public async pingDevices(deviceIds: string[], timeoutMs: number = 1500): Promise<Record<string, { online: boolean; rttMs?: number }>> {
    const results: Record<string, { online: boolean; rttMs?: number }> = {};
    const promises: Promise<void>[] = [];

    deviceIds.forEach((deviceId) => {
      const socketIds = Array.from(this.deviceToSockets.get(deviceId) || []);
      if (socketIds.length === 0) {
        results[deviceId] = { online: false };
        return;
      }
      const socketId = socketIds[0];
      const socket = this.io?.sockets.sockets.get(socketId) as any;
      if (!socket) {
        results[deviceId] = { online: false };
        return;
      }

      const start = Date.now();
      const p = new Promise<void>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            results[deviceId] = { online: true }; // presence-only fallback
            settled = true;
            resolve();
          }
        }, timeoutMs);

        try {
          if (typeof socket.timeout === 'function' && typeof socket.emitWithAck === 'function') {
            socket.timeout(timeoutMs).emitWithAck('ping').then(() => {
              if (!settled) {
                clearTimeout(timer);
                results[deviceId] = { online: true, rttMs: Date.now() - start };
                settled = true;
                resolve();
              }
            }).catch(() => {
              if (!settled) {
                clearTimeout(timer);
                results[deviceId] = { online: this.isDeviceConnected(deviceId) };
                settled = true;
                resolve();
              }
            });
          } else {
            socket.emit('ping');
          }
        } catch (_) {
          if (!settled) {
            clearTimeout(timer);
            results[deviceId] = { online: this.isDeviceConnected(deviceId) };
            settled = true;
            resolve();
          }
        }
      });

      promises.push(p);
    });

    await Promise.all(promises);
    return results;
  }

  // Метод для отправки события всем подключенным клиентам
  public emit(event: string, payload?: any): void {
    if (this.io) {
      this.io.emit(event, payload);
    }
  }
}