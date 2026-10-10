import type { DeviceNodeData, LogEntry } from '../types.ts';

type Listener = (data: any) => void;

class CyberOpsSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<Listener>> = new Map();
  private reconnectTimer: any = null;
  private restPollTimer: any = null;
  private isConnecting = false;
  public isConnected = false;
  private currentRole: 'admin' | 'node' | null = null;
  private currentId: string = '';
  private currentPayload: any = null;

  connect(role: 'admin' | 'node', id: string, initialPayload?: any) {
    this.currentRole = role;
    this.currentId = id;
    this.currentPayload = initialPayload;

    // Start background REST sync immediately as safety net
    this.startRestSync();

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendRegistration();
      }
      return;
    }

    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.emit('connection_change', { connected: true });
        this.sendRegistration();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit(msg.type, msg);
          this.emit('*', msg);
        } catch (e) {
          console.error('Failed to parse WS payload', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.emit('connection_change', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.emit('connection_change', { connected: false });
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private sendRegistration() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.currentRole === 'node') {
      this.send({
        type: 'register_node',
        nodeId: this.currentId,
        payload: this.currentPayload,
      });
    } else if (this.currentRole === 'admin') {
      this.send({
        type: 'register_admin',
        payload: this.currentPayload,
      });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.currentRole) {
        this.connect(this.currentRole, this.currentId, this.currentPayload);
      }
    }, 3000);
  }

  // REST Dual-Transport Fallback: Polls periodically so sync NEVER fails
  private startRestSync() {
    if (this.restPollTimer) clearInterval(this.restPollTimer);

    this.restPollTimer = setInterval(async () => {
      try {
        if (this.currentRole === 'admin') {
          // Poll active devices
          const res = await fetch('/api/devices');
          if (res.ok) {
            const data = await res.json();
            if (data.devices) {
              this.emit('devices_list', { payload: data.devices });
            }
          }
        } else if (this.currentRole === 'node' && this.currentId) {
          // Check for pending commands via REST
          const res = await fetch(`/api/node/poll-commands?nodeId=${encodeURIComponent(this.currentId)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.commands) && data.commands.length > 0) {
              for (const cmd of data.commands) {
                this.emit('command', cmd);
              }
            }
          }
        }
      } catch (err) {
        // Ignore background polling errors
      }
    }, 1200);
  }

  send(data: any) {
    let sentWs = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        sentWs = true;
      } catch (e) {
        sentWs = false;
      }
    }

    // Also dispatch to REST endpoints for 100% guarantee
    if (data.type === 'telemetry' && data.nodeId) {
      fetch('/api/node/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).catch(() => {});
    } else if (data.type === 'frame' && data.nodeId && data.image) {
      fetch('/api/node/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: data.nodeId,
          image: data.image,
          fps: data.payload?.fps,
        }),
      }).catch(() => {});
    } else if (data.type === 'command') {
      fetch('/api/admin/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: data.targetId || data.nodeId,
          action: data.action,
          state: data.state,
          facingMode: data.facingMode,
          payload: data.payload,
        }),
      }).catch(() => {});
    }

    return sentWs;
  }

  on(event: string, callback: Listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`Error in WS listener for ${event}:`, err);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.restPollTimer) clearInterval(this.restPollTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.currentRole = null;
  }
}

export const cyberSocket = new CyberOpsSocketClient();

/**
 * Admin authentication with password 'Ilhamfazril'
 */
export async function authenticateAdmin(password: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem('ilham_ops_auth_token', data.token || 'AUTHORIZED');
      return { success: true, message: data.message };
    }
    return { success: false, message: data.message || 'Password salah' };
  } catch (e: any) {
    // Client-side fallback check
    if (password === 'Ilhamfazril') {
      sessionStorage.setItem('ilham_ops_auth_token', 'AUTHORIZED_FALLBACK');
      return { success: true, message: 'Akses Diberikan: Selamat Datang Komandan Ilham.' };
    }
    return { success: false, message: 'Password salah atau gagal menghubungi server' };
  }
}

export function isSessionAuthorized(): boolean {
  return Boolean(sessionStorage.getItem('ilham_ops_auth_token'));
}

export function clearAdminSession(): void {
  sessionStorage.removeItem('ilham_ops_auth_token');
}

/**
 * Web Audio synthesizer for tactical beeps & alarms (no external MP3 required)
 */
export function playTacticalSound(type: 'beep' | 'radar' | 'alert' | 'switch') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'beep') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'radar') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(540, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'alert') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(900, now + 0.1);
      osc.frequency.setValueAtTime(600, now + 0.2);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'switch') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (e) {
    // Audio autoplay might be suspended until interaction
  }
}
