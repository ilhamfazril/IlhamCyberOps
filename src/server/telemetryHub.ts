import { WebSocket } from 'ws';

export interface DeviceNode {
  id: string;
  name: string;
  platform: string;
  batteryLevel?: number;
  batteryCharging?: boolean;
  facingMode: 'user' | 'environment';
  torchOn: boolean;
  lastPing: number;
  gps?: {
    lat: number;
    lng: number;
    accuracy?: number;
    altitude?: number | null;
    speed?: number | null;
    heading?: number | null;
    timestamp: number;
  };
  lastFrame?: string;
  fps?: number;
  online: boolean;
}

export interface PendingCommand {
  id: string;
  action: string;
  state?: boolean;
  facingMode?: 'user' | 'environment';
  payload?: any;
  timestamp: number;
}

export interface WsMessage {
  type: string;
  nodeId?: string;
  targetId?: string;
  senderId?: string;
  action?: string;
  state?: boolean;
  facingMode?: 'user' | 'environment';
  payload?: any;
  message?: string;
  level?: string;
  timestamp?: number;
  image?: string;
  gps?: any;
  battery?: any;
  torchOn?: boolean;
}

class TelemetryHub {
  private devices = new Map<string, DeviceNode>();
  private sockets = new Map<WebSocket, { role: 'node' | 'admin'; id: string }>();
  private adminSockets = new Set<WebSocket>();
  // Queue of commands for nodes (ensures delivery even if WS drops)
  private pendingCommands = new Map<string, PendingCommand[]>();

  registerSocket(ws: WebSocket, role: 'node' | 'admin', id: string) {
    this.sockets.set(ws, { role, id });
    if (role === 'admin') {
      this.adminSockets.add(ws);
      // Immediately send current devices list to new admin
      this.sendToSocket(ws, {
        type: 'devices_list',
        payload: this.getDevices(),
      });
    }
  }

  unregisterSocket(ws: WebSocket) {
    const info = this.sockets.get(ws);
    if (!info) return;

    if (info.role === 'admin') {
      this.adminSockets.delete(ws);
    } else if (info.role === 'node') {
      const dev = this.devices.get(info.id);
      if (dev) {
        dev.online = false;
        dev.lastPing = Date.now();
        this.broadcastToAdmins({
          type: 'node_status',
          nodeId: info.id,
          payload: { online: false },
        });
      }
    }
    this.sockets.delete(ws);
  }

  handleMessage(ws: WebSocket, raw: string) {
    try {
      const msg: WsMessage = JSON.parse(raw);
      const now = Date.now();

      switch (msg.type) {
        case 'register_node': {
          const nodeId = msg.nodeId || `node-${Math.random().toString(36).substring(2, 7)}`;
          const nodeData: DeviceNode = {
            id: nodeId,
            name: msg.payload?.name || `HP-${nodeId.slice(-4).toUpperCase()}`,
            platform: msg.payload?.platform || 'Mobile Web',
            batteryLevel: msg.payload?.battery?.level,
            batteryCharging: msg.payload?.battery?.charging,
            facingMode: msg.payload?.facingMode || 'environment',
            torchOn: false,
            lastPing: now,
            gps: msg.payload?.gps,
            online: true,
          };
          this.devices.set(nodeId, nodeData);
          this.registerSocket(ws, 'node', nodeId);

          this.sendToSocket(ws, {
            type: 'registered',
            nodeId,
            payload: nodeData,
          });

          this.broadcastToAdmins({
            type: 'node_joined',
            nodeId,
            payload: nodeData,
          });
          break;
        }

        case 'register_admin': {
          const adminId = `admin-${Math.random().toString(36).substring(2, 7)}`;
          this.registerSocket(ws, 'admin', adminId);
          this.sendToSocket(ws, {
            type: 'admin_registered',
            payload: {
              adminId,
              devices: this.getDevices(),
            },
          });
          break;
        }

        case 'telemetry': {
          if (!msg.nodeId) return;
          this.updateTelemetry(msg.nodeId, {
            gps: msg.gps,
            battery: msg.battery,
            facingMode: msg.facingMode,
            torchOn: msg.torchOn,
          });
          break;
        }

        case 'frame': {
          if (!msg.nodeId || !msg.image) return;
          this.updateFrame(msg.nodeId, msg.image, msg.payload?.fps);
          break;
        }

        case 'command': {
          const targetNodeId = msg.targetId || msg.nodeId;
          if (!targetNodeId) return;
          this.dispatchCommand(targetNodeId, {
            action: msg.action || '',
            state: msg.state,
            facingMode: msg.facingMode,
            payload: msg.payload,
          });
          break;
        }

        case 'log': {
          this.broadcastToAdmins({
            type: 'log',
            nodeId: msg.nodeId,
            level: msg.level || 'info',
            message: msg.message || '',
            timestamp: now,
          });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  }

  updateTelemetry(nodeId: string, data: { gps?: any; battery?: any; facingMode?: any; torchOn?: boolean }) {
    const now = Date.now();
    let dev = this.devices.get(nodeId);
    if (!dev) {
      dev = {
        id: nodeId,
        name: `HP-${nodeId.slice(-4).toUpperCase()}`,
        platform: 'Mobile Web',
        facingMode: data.facingMode || 'environment',
        torchOn: Boolean(data.torchOn),
        lastPing: now,
        online: true,
      };
      this.devices.set(nodeId, dev);
    }

    dev.lastPing = now;
    dev.online = true;
    if (data.gps) dev.gps = data.gps;
    if (data.battery) {
      dev.batteryLevel = data.battery.level;
      dev.batteryCharging = data.battery.charging;
    }
    if (data.facingMode) dev.facingMode = data.facingMode;
    if (typeof data.torchOn === 'boolean') dev.torchOn = data.torchOn;

    this.broadcastToAdmins({
      type: 'node_telemetry',
      nodeId,
      gps: data.gps,
      battery: data.battery,
      facingMode: data.facingMode,
      torchOn: data.torchOn,
      timestamp: now,
    });
  }

  updateFrame(nodeId: string, image: string, fps?: number) {
    const now = Date.now();
    let dev = this.devices.get(nodeId);
    if (!dev) {
      dev = {
        id: nodeId,
        name: `HP-${nodeId.slice(-4).toUpperCase()}`,
        platform: 'Mobile Web',
        facingMode: 'environment',
        torchOn: false,
        lastPing: now,
        online: true,
      };
      this.devices.set(nodeId, dev);
    }
    dev.lastPing = now;
    dev.online = true;
    dev.lastFrame = image;
    dev.fps = fps || 10;

    this.broadcastToAdmins({
      type: 'node_frame',
      nodeId,
      image,
      fps: dev.fps,
      timestamp: now,
    });
  }

  dispatchCommand(nodeId: string, commandData: { action: string; state?: boolean; facingMode?: any; payload?: any }) {
    const now = Date.now();
    const cmd: PendingCommand = {
      id: Math.random().toString(36).substring(2, 9),
      action: commandData.action,
      state: commandData.state,
      facingMode: commandData.facingMode,
      payload: commandData.payload,
      timestamp: now,
    };

    // Store in pending queue
    if (!this.pendingCommands.has(nodeId)) {
      this.pendingCommands.set(nodeId, []);
    }
    this.pendingCommands.get(nodeId)!.push(cmd);
    // Keep max 10 pending
    if (this.pendingCommands.get(nodeId)!.length > 10) {
      this.pendingCommands.get(nodeId)!.shift();
    }

    // Try WS push directly
    let found = false;
    for (const [s, info] of this.sockets.entries()) {
      if (info.role === 'node' && info.id === nodeId) {
        this.sendToSocket(s, {
          type: 'command',
          ...cmd,
        });
        found = true;
        break;
      }
    }

    // Also update dev state optimistically if possible
    const dev = this.devices.get(nodeId);
    if (dev) {
      if (commandData.action === 'switch_camera' && commandData.facingMode) {
        dev.facingMode = commandData.facingMode;
      }
      if (commandData.action === 'toggle_torch' && typeof commandData.state === 'boolean') {
        dev.torchOn = commandData.state;
      }
    }

    this.broadcastToAdmins({
      type: 'log',
      level: 'command',
      message: `Perintah [${cmd.action.toUpperCase()}] dikirim ke ${nodeId} (${found ? 'Terkirim via WS' : 'Masuk Antrean REST'})`,
      timestamp: now,
    });

    return cmd;
  }

  consumePendingCommands(nodeId: string): PendingCommand[] {
    const queue = this.pendingCommands.get(nodeId) || [];
    this.pendingCommands.set(nodeId, []);
    return queue;
  }

  private sendToSocket(ws: WebSocket, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private broadcastToAdmins(data: any) {
    const payloadStr = JSON.stringify(data);
    for (const ws of this.adminSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payloadStr);
      }
    }
  }

  getDevices(): DeviceNode[] {
    const now = Date.now();
    // Check timeout: if no ping within 25s, mark offline
    for (const dev of this.devices.values()) {
      if (now - dev.lastPing > 25000) {
        dev.online = false;
      } else {
        dev.online = true;
      }
    }
    return Array.from(this.devices.values());
  }

  getDevice(id: string): DeviceNode | undefined {
    return this.devices.get(id);
  }
}

export const telemetryHub = new TelemetryHub();
