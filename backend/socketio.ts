import { Server } from 'socket.io';
import { createServer } from 'http';

type ConnectionInfo = {
  userId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
};

export class SocketIOService {
  private static instance: SocketIOService;
  private io: Server | null = null;
  private connections = new Map<string, ConnectionInfo>();

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
      transports: ['websocket', 'polling'], // Добавляем polling как fallback
      pingTimeout: 60000, // Увеличиваем таймаут
      pingInterval: 20000, // Уменьшаем интервал
      cookie: false,
      allowEIO3: true, // Для совместимости
      serveClient: false,
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000, // 2 минуты
        skipMiddlewares: true
      }
    });

    this.setupConnectionHandlers();
    this.setupCleanupInterval();
  }

  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      const userId = socket.handshake.query.userId as string;
      
      if (!userId) {
        console.warn('[Socket.IO] Connection attempt without userId');
        socket.disconnect(true);
        return;
      }

      // Более мягкая обработка старых соединений
      this.gracefullyHandleOldConnections(userId, socket.id);

      const connectionInfo: ConnectionInfo = {
        userId,
        socketId: socket.id,
        connectedAt: new Date(),
        lastActivity: new Date()
      };

      this.connections.set(socket.id, connectionInfo);
      console.log(`[Socket.IO] ${userId} connected (socketId:${socket.id})`);

      socket.emit('connection_ack', {
        status: 'connected',
        userId,
        socketId: socket.id,
        timestamp: Date.now()
      });

      socket.on('disconnect', (reason) => {
        this.connections.delete(socket.id);
        console.log(`[Socket.IO] ${userId} disconnected (${reason})`);
      });

      socket.on('error', (err) => {
        console.error(`[Socket.IO] ${userId} error:`, err);
        this.connections.delete(socket.id);
      });

      // Обновляем активность при любом сообщении
      socket.onAny(() => {
        const conn = this.connections.get(socket.id);
        if (conn) {
          conn.lastActivity = new Date();
        }
      });
    });
  }

  private gracefullyHandleOldConnections(userId: string, newSocketId: string): void {
    const activeConnections = this.getUserConnections(userId);
    
    // Закрываем только действительно старые соединения
    activeConnections.forEach(conn => {
      const inactiveDuration = Date.now() - conn.lastActivity.getTime();
      if (inactiveDuration > 30000) { // 30 секунд неактивности
        this.io?.sockets.sockets.get(conn.socketId)?.disconnect(true);
        this.connections.delete(conn.socketId);
        console.log(`[Socket.IO] Closed inactive connection for ${userId} (${conn.socketId})`);
      }
    });
  }

  private setupCleanupInterval(): void {
    // Регулярная очистка неактивных соединений
    setInterval(() => {
      const now = Date.now();
      this.connections.forEach((conn, socketId) => {
        const inactiveDuration = now - conn.lastActivity.getTime();
        if (inactiveDuration > 120000) { // 2 минуты неактивности
          this.io?.sockets.sockets.get(socketId)?.disconnect(true);
          this.connections.delete(socketId);
          console.log(`[Socket.IO] Cleaned up inactive connection ${socketId}`);
        }
      });
    }, 60000); // Каждую минуту
  }

  public sendToUser(userId: string, message: any): boolean {
    const connections = this.getUserConnections(userId);
    if (connections.length === 0) return false;

    let success = true;
    connections.forEach(conn => {
      try {
        this.io?.to(conn.socketId).emit('notification', {
          ...message,
          sentAt: new Date().toISOString()
        });
        conn.lastActivity = new Date(); // Обновляем активность
      } catch (err) {
        console.error(`[Socket.IO] Error sending to ${userId}:`, err);
        this.connections.delete(conn.socketId);
        success = false;
      }
    });

    return success;
  }

  private getUserConnections(userId: string): ConnectionInfo[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.userId === userId);
  }

  public getConnectedUsers(): string[] {
    return Array.from(new Set(
      Array.from(this.connections.values()).map(conn => conn.userId)
    ));
  }

  public getConnectionCount(): number {
    return this.connections.size;
  }
}