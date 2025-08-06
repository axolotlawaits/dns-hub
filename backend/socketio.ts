import { Server } from 'socket.io';
import { createServer } from 'http';
import { APIWebSocket } from './server.js';

type ConnectionInfo = {
  userId: string;
  socketId: string;
};

export class SocketIOService {
  private static instance: SocketIOService;
  private io: Server | null = null;
  private connections = new Map<string, ConnectionInfo>(); // key: socketId

  public static getInstance(): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService();
    }
    return SocketIOService.instance;
  }

  public initialize(server: ReturnType<typeof createServer>): void {
    this.io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://dns-zs.partner.ru', 'http://10.11.145.196'] 
          : ['http://localhost:5173', 'http://10.11.145.196'],
        methods: ["GET", "POST"]
      },
      path: '/socket.io' // Путь по умолчанию для Socket.IO
    });

    this.io.on('connection', (socket) => {
      const userId = socket.handshake.query.userId as string;
      if (!userId) {
        socket.disconnect(true);
        return;
      }

      // Закрываем предыдущие соединения для этого пользователя
      this.getUserConnections(userId).forEach(conn => {
        const oldSocket = this.io?.sockets.sockets.get(conn.socketId);
        if (oldSocket) {
          oldSocket.disconnect(true);
          this.connections.delete(conn.socketId);
        }
      });

      // Сохраняем новое соединение
      this.connections.set(socket.id, { userId, socketId: socket.id });
      console.log(`[Socket.IO] ${userId} connected (socketId:${socket.id})`);

      // Отправляем подтверждение
      socket.emit('connection_ack', {
        status: 'connected',
        timestamp: Date.now()
      });

      socket.on('disconnect', () => {
        this.connections.delete(socket.id);
        console.log(`[Socket.IO] ${userId} disconnected (socketId:${socket.id})`);
      });

      socket.on('error', (err) => {
        console.error(`[Socket.IO] ${userId} error:`, err);
        this.connections.delete(socket.id);
      });
    });
  }

  public sendToUser(userId: string, message: any): void {
    const connections = this.getUserConnections(userId);
    if (connections.length === 0) {
      console.log(`[Socket.IO] No active connections for user ${userId}`);
      return;
    }

    connections.forEach(conn => {
      try {
        this.io?.to(conn.socketId).emit('notification', message);
        console.log(`[Socket.IO] Message sent to ${userId} (socketId:${conn.socketId})`);
      } catch (err) {
        console.error(`[Socket.IO] Error sending to ${userId}:`, err);
        this.connections.delete(conn.socketId);
      }
    });
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