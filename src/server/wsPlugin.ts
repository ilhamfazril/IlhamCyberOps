import type { PluginOption } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { telemetryHub } from './telemetryHub.ts';

export function cyberOpsServerPlugin(): PluginOption {
  return {
    name: 'cyber-ops-server-plugin',
    configureServer(server) {
      if (!server.httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      server.httpServer.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname === '/ws') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });

      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          telemetryHub.handleMessage(ws, data.toString());
        });

        ws.on('close', () => {
          telemetryHub.unregisterSocket(ws);
        });

        ws.on('error', (err) => {
          console.error('WebSocket client error:', err);
          telemetryHub.unregisterSocket(ws);
        });
      });

      // Also attach REST middleware for fallback & device inspection
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/devices') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ devices: telemetryHub.getDevices() }));
          return;
        }

        if (req.url === '/api/health') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', server: 'ILHAM CYBER-OPS' }));
          return;
        }

        next();
      });
    },
  };
}
