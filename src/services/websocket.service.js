const WebSocket = require('ws');
const authService = require('./auth.service');
const quotaService = require('./quota.service');

class WebSocketService {
  constructor() {
    this.server = null;
    this.wss = null;
    this.initialized = false;
    this.clientsByUser = new Map(); // userId -> Set<WebSocket>
  }

  init(server) {
    if (this.initialized) {
      return this.wss;
    }

    this.server = server;
    this.wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      try {
        const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
        if (parsedUrl.pathname === '/ws/quota') {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.handleQuotaConnection(ws, parsedUrl);
          });
        } else {
          socket.destroy();
        }
      } catch (error) {
        socket.destroy();
      }
    });

    this.initialized = true;
    return this.wss;
  }

  async handleQuotaConnection(ws, parsedUrl) {
    const token = parsedUrl.searchParams.get('token');
    if (!token) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    let decoded;
    try {
      decoded = authService.verifyToken(token);
    } catch (error) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    const userId = decoded.id;
    ws.userId = userId;

    if (!this.clientsByUser.has(userId)) {
      this.clientsByUser.set(userId, new Set());
    }
    this.clientsByUser.get(userId).add(ws);

    ws.on('close', () => this.removeClient(userId, ws));
    ws.on('error', () => this.removeClient(userId, ws));

    // Send immediate snapshot so UI has baseline
    this.emitQuotaUpdate(userId, ws).catch(err => {
      console.error('[WebSocket] Failed to send quota snapshot:', err);
    });
  }

  removeClient(userId, ws) {
    const set = this.clientsByUser.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.clientsByUser.delete(userId);
    }
  }

  async emitQuotaUpdate(userId, targetSocket = null) {
    try {
      const quota = await quotaService.getQuotaStatus(userId);
      const formatted = quotaService.formatQuotaResponse(quota);
      if (!formatted) {
        return;
      }

      const message = JSON.stringify({
        type: 'quota:update',
        payload: formatted,
        timestamp: new Date().toISOString()
      });

      if (targetSocket) {
        if (targetSocket.readyState === WebSocket.OPEN) {
          targetSocket.send(message);
        }
        return;
      }

      const sockets = this.clientsByUser.get(userId);
      if (!sockets || sockets.size === 0) {
        return;
      }

      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    } catch (error) {
      console.error('[WebSocket] emitQuotaUpdate error:', error);
    }
  }
}

module.exports = new WebSocketService();
