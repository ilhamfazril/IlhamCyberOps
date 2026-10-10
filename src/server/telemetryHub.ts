import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

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

// In-memory hub for real-time node coordination
class TelemetryHub {
  private devices = new Map<string, DeviceNode>();
  private sockets = new Map<WebSocket, { role: 'node' | 'admin'; id: string }>();
  private adminSockets = new Set<WebSocket>();

  registerSocket(ws: WebSocket, role: 'node' | 'admin', id: string) {
    this.sockets.set(ws, { role, id });
    if (role === 'admin') {
      this.adminSockets.add(ws);
      // Immediately send current devices list to new admin
      this.sendToSocket(ws, {
        type: 'devices_list',
        payload: Array.from(this.devices.values()),
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
        dev.lastPing = Date.now();
        // Notify admins that node went offline
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
          };
          this.devices.set(nodeId, nodeData);
          this.registerSocket(ws, 'node', nodeId);

          // Confirm to node
          this.sendToSocket(ws, {
            type: 'registered',
            nodeId,
            payload: nodeData,
          });

          // Broadcast to all admins
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
              devices: Array.from(this.devices.values()),
            },
          });
          break;
        }

        case 'telemetry': {
          if (!msg.nodeId) return;
          const dev = this.devices.get(msg.nodeId);
          if (dev) {
            dev.lastPing = now;
            if (msg.gps) dev.gps = msg.gps;
            if (msg.battery) {
              dev.batteryLevel = msg.battery.level;
              dev.batteryCharging = msg.battery.charging;
            }
            if (msg.facingMode) dev.facingMode = msg.facingMode;
            if (typeof msg.torchOn === 'boolean') dev.torchOn = msg.torchOn;
          }

          // Forward telemetry to admins
          this.broadcastToAdmins({
            type: 'node_telemetry',
            nodeId: msg.nodeId,
            gps: msg.gps,
            battery: msg.battery,
            facingMode: msg.facingMode,
            torchOn: msg.torchOn,
            timestamp: now,
          });
          break;
        }

        case 'frame': {
          if (!msg.nodeId || !msg.image) return;
          const dev = this.devices.get(msg.nodeId);
          if (dev) {
            dev.lastPing = now;
            dev.lastFrame = msg.image;
            dev.fps = msg.payload?.fps || 10;
          }

          // Broadcast frame to admins
          this.broadcastToAdmins({
            type: 'node_frame',
            nodeId: msg.nodeId,
            image: msg.image,
            fps: msg.payload?.fps,
            timestamp: now,
          });
          break;
        }

        case 'command': {
          // Sent from Admin to Node
          const targetNodeId = msg.targetId || msg.nodeId;
          if (!targetNodeId) return;

          // Find the socket for this node
          let found = false;
          for (const [s, info] of this.sockets.entries()) {
            if (info.role === 'node' && info.id === targetNodeId) {
              this.sendToSocket(s, {
                type: 'command',
                action: msg.action,
                state: msg.state,
                facingMode: msg.facingMode,
                payload: msg.payload,
                timestamp: now,
              });
              found = true;
              break;
            }
          }

          // Log command action back to admins
          this.broadcastToAdmins({
            type: 'log',
            level: 'info',
            message: `Command [${msg.action}] sent to node ${targetNodeId} (${found ? 'Delivered' : 'Offline/Not routed'})`,
            timestamp: now,
          });
          break;
        }

        case 'log': {
          // Forward node logs to admins
          this.broadcastToAdmins({
            type: 'log',
            nodeId: msg.nodeId,
            level: msg.level || 'info',
            message: msg.message || '',
            timestamp: now,
          });
          break;
        }

        case 'webrtc_signal': {
          // Relay WebRTC signaling between admin and node
          const targetId = msg.targetId;
          if (!targetId) return;

          for (const [s, info] of this.sockets.entries()) {
            if (info.id === targetId) {
              this.sendToSocket(s, {
                type: 'webrtc_signal',
                senderId: msg.senderId,
                payload: msg.payload,
              });
              break;
            }
          }
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
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
    return Array.from(this.devices.values());
  }
}

export const telemetryHub = new TelemetryHub();
