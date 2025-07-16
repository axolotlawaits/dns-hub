import { WebSocketServer, WebSocket } from 'ws';
import { APIWebSocket } from './server';

type ConnectionInfo = {
  userId: string;
  cid: string;
  socket: WebSocket;
};

export class WebSocketService {
  private static instance: WebSocketService;
  private wss: WebSocketServer | null = null;
  private connections = new Map<string, ConnectionInfo>(); // key: cid

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(server: any): void {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const params = new URL(req.url || '', `${APIWebSocket}`).searchParams;
      const userId = params.get('userId') || 'unknown';
      const cid = params.get('cid') || `gen_${Date.now()}`;

      // Закрываем предыдущие соединения для этого пользователя
      this.getUserConnections(userId).forEach(conn => {
        if (conn.cid !== cid) {
          conn.socket.close(1000, 'Replaced by new connection');
          this.connections.delete(conn.cid);
        }
      });

      // Сохраняем новое соединение
      this.connections.set(cid, { userId, cid, socket: ws });
      console.log(`[WS-Server] ${userId} connected (cid:${cid})`);

      ws.on('close', () => {
        this.connections.delete(cid);
        console.log(`[WS-Server] ${userId} disconnected (cid:${cid})`);
      });

      ws.on('error', (err) => {
        console.error(`[WS-Server] ${userId} error:`, err);
        this.connections.delete(cid);
      });

      // Отправляем подтверждение
      ws.send(JSON.stringify({
        event: 'connection_ack',
        data: { status: 'connected', timestamp: Date.now() }
      }));
    });

    server.on('upgrade', (req: any, socket: any, head: any) => {
      const params = new URL(req.url || '', `${APIWebSocket}`).searchParams;
      if (!params.get('userId')) {
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.wss?.emit('connection', ws, req);
      });
    });
  }

  public sendToUser(userId: string, message: any): void {
    const connections = this.getUserConnections(userId);
    if (connections.length === 0) {
      console.log(`[WS-Server] No active connections for user ${userId}`);
      return;
    }

    connections.forEach(conn => {
      try {
        conn.socket.send(JSON.stringify(message));
        console.log(`[WS-Server] Message sent to ${userId} (cid:${conn.cid})`);
      } catch (err) {
        console.error(`[WS-Server] Error sending to ${userId}:`, err);
        this.connections.delete(conn.cid);
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