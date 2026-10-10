import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { telemetryHub } from './src/server/telemetryHub.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

const wss = new WebSocketServer({ server, path: '/ws' });

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

app.use(express.json());

// API endpoints
app.get('/api/devices', (_req, res) => {
  res.json({ devices: telemetryHub.getDevices() });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', server: 'ILHAM CYBER-OPS' });
});

// Serve frontend build
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

server.listen(port, () => {
  console.log(`[ILHAM CYBER-OPS] Server listening on port ${port}`);
});
