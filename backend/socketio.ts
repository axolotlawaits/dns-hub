import { Server } from 'socket.io';
import { createServer } from 'http';
import { APIWebSocket } from './server.js';

type ConnectionInfo = {
  userId: string;
  socketId: string;
  connectedAt: Date;
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
      transports: ['websocket'],
      pingTimeout: 30000,
      pingInterval: 25000,
      cookie: false
    });

    this.setupConnectionHandlers();
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

      this.cleanupOldConnections(userId, socket.id);

      const connectionInfo: ConnectionInfo = {
        userId,
        socketId: socket.id,
        connectedAt: new Date()
      };

      this.connections.set(socket.id, connectionInfo);
      console.log(`[Socket.IO] ${userId} connected (socketId:${socket.id})`);

      // Отправляем подтверждение подключения
      socket.emit('connection_ack', {
        status: 'connected',
        userId,
        socketId: socket.id,
        timestamp: Date.now()
      });

      // Обработчики событий
      socket.on('disconnect', (reason) => {
        this.connections.delete(socket.id);
        console.log(`[Socket.IO] ${userId} disconnected (${reason})`);
      });

      socket.on('error', (err) => {
        console.error(`[Socket.IO] ${userId} error:`, err);
        this.connections.delete(socket.id);
      });
    });
  }

  private cleanupOldConnections(userId: string, newSocketId: string): void {
    this.getUserConnections(userId).forEach(conn => {
      if (conn.socketId !== newSocketId) {
        this.io?.sockets.sockets.get(conn.socketId)?.disconnect(true);
        this.connections.delete(conn.socketId);
        console.log(`[Socket.IO] Closed old connection for ${userId} (${conn.socketId})`);
      }
    });
  }

  public sendToUser(userId: string, message: any): boolean {
    const connections = this.getUserConnections(userId);
    if (connections.length === 0) {
      console.warn(`[Socket.IO] No active connections for user ${userId}`);
      return false;
    }

    let success = true;
    connections.forEach(conn => {
      try {
        this.io?.to(conn.socketId).emit('notification', {
          ...message,
          sentAt: new Date().toISOString()
        });
        console.log(`[Socket.IO] Sent to ${userId} (${conn.socketId})`);
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