import { Peer, DataConnection, MediaConnection } from 'peerjs';
import type { GpsCoordinates, LogEntry } from '../types.ts';

type Listener = (data: any) => void;

// Free public STUN servers for NAT traversal across 4G/5G mobile & Wi-Fi
const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};

export class CyberOpsPeerNode {
  public peer: Peer | null = null;
  public myPeerId: string = '';
  public targetPeerId: string = '';
  public dataConn: DataConnection | null = null;
  public mediaConn: MediaConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;
  public isConnected = false;
  private listeners: Map<string, Set<Listener>> = new Map();
  private heartbeatTimer: any = null;

  // Initialize as Node (Target Phone)
  initNode(nodeId: string, stream: MediaStream) {
    this.myPeerId = nodeId;
    this.localStream = stream;
    this.cleanup();

    this.peer = new Peer(this.myPeerId, PEER_CONFIG);

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      this.emit('open', { id });
      this.emit('status', { status: 'ONLINE', message: `Node aktif dengan ID: ${id}` });
    });

    // Handle incoming Data Connection from Admin
    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    // Handle incoming Call from Admin
    this.peer.on('call', (call) => {
      this.mediaConn = call;
      call.answer(this.localStream || undefined);

      call.on('stream', (rStream) => {
        this.remoteStream = rStream;
        this.emit('remote_stream', rStream);
      });

      call.on('close', () => {
        this.emit('call_closed', {});
      });
    });

    this.peer.on('error', (err: any) => {
      console.warn('PeerJS Node error:', err);
      if (err.type === 'unavailable-id') {
        // Fallback: append random suffix if ID already taken
        const fallbackId = `${nodeId}-${Math.floor(100 + Math.random() * 900)}`;
        this.initNode(fallbackId, stream);
      } else {
        this.emit('error', err);
      }
    });
  }

  // Initialize as Admin (Command Center)
  initAdmin(adminId: string = 'ILHAM-ADMIN-OPS') {
    this.myPeerId = adminId;
    this.cleanup();

    this.peer = new Peer(this.myPeerId, PEER_CONFIG);

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      this.emit('open', { id });
      this.emit('status', { status: 'ONLINE', message: `Command Center siap dengan ID: ${id}` });
    });

    this.peer.on('connection', (conn) => {
      this.setupDataConnection(conn);
    });

    this.peer.on('call', (call) => {
      this.mediaConn = call;
      call.answer(); // Admin answers without sending video back

      call.on('stream', (rStream) => {
        this.remoteStream = rStream;
        this.emit('remote_stream', rStream);
      });

      call.on('close', () => {
        this.emit('call_closed', {});
      });
    });

    this.peer.on('error', (err: any) => {
      console.warn('PeerJS Admin error:', err);
      if (err.type === 'unavailable-id') {
        const fallbackId = `${adminId}-${Math.floor(100 + Math.random() * 900)}`;
        this.initAdmin(fallbackId);
      } else {
        this.emit('error', err);
      }
    });
  }

  // Admin calls and connects to Target Node
  connectToTarget(targetId: string) {
    if (!this.peer || this.peer.destroyed) return;
    this.targetPeerId = targetId;

    // 1. Establish Data Connection for commands & telemetry
    const conn = this.peer.connect(targetId, {
      reliable: true,
    });
    this.setupDataConnection(conn);

    // 2. Establish Media Call for video stream
    // Admin calls the node, node answers with its video stream
    const call = this.peer.call(targetId, new MediaStream()); // dummy stream, node answers with real video
    this.mediaConn = call;

    call.on('stream', (rStream) => {
      this.remoteStream = rStream;
      this.emit('remote_stream', rStream);
    });

    call.on('close', () => {
      this.emit('call_closed', {});
    });

    call.on('error', (err) => {
      console.warn('Call error:', err);
    });
  }

  // Node calls Admin (Reverse call in case Node wants to initiate stream)
  callAdmin(adminId: string) {
    if (!this.peer || !this.localStream) return;
    this.targetPeerId = adminId;

    // Data connection
    const conn = this.peer.connect(adminId, { reliable: true });
    this.setupDataConnection(conn);

    // Media call
    const call = this.peer.call(adminId, this.localStream);
    this.mediaConn = call;

    call.on('stream', (rStream) => {
      this.remoteStream = rStream;
      this.emit('remote_stream', rStream);
    });
  }

  // Setup Data Connection handlers
  private setupDataConnection(conn: DataConnection) {
    this.dataConn = conn;

    conn.on('open', () => {
      this.isConnected = true;
      this.emit('connected', { peer: conn.peer });

      // Start periodic ping
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (this.dataConn && this.dataConn.open) {
          this.dataConn.send({ type: 'ping', time: Date.now() });
        }
      }, 3000);
    });

    conn.on('data', (data: any) => {
      if (data && typeof data === 'object') {
        if (data.type === 'ping') {
          // respond with pong
          conn.send({ type: 'pong', time: data.time });
          return;
        }
        if (data.type === 'pong') {
          const rtt = Date.now() - (data.time || Date.now());
          this.emit('rtt', { rtt });
          return;
        }

        // Emit specific event and generic event
        if (data.type) {
          this.emit(data.type, data);
        }
        this.emit('data', data);
      }
    });

    conn.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected', { peer: conn.peer });
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    });

    conn.on('error', (err) => {
      console.warn('Data connection error:', err);
      this.emit('conn_error', err);
    });
  }

  // Replace video track on active WebRTC call without renegotiating!
  replaceVideoTrack(newTrack: MediaStreamTrack) {
    if (this.mediaConn && (this.mediaConn as any).peerConnection) {
      const pc: RTCPeerConnection = (this.mediaConn as any).peerConnection;
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack);
        return true;
      }
    }
    return false;
  }

  // Send data over WebRTC DataChannel
  send(data: any): boolean {
    if (this.dataConn && this.dataConn.open) {
      this.dataConn.send(data);
      return true;
    }
    return false;
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
        console.error(`Error in Peer listener for ${event}:`, err);
      }
    });
  }

  cleanup() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.dataConn) {
      this.dataConn.close();
      this.dataConn = null;
    }
    if (this.mediaConn) {
      this.mediaConn.close();
      this.mediaConn = null;
    }
    if (this.peer && !this.peer.destroyed) {
      this.peer.destroy();
      this.peer = null;
    }
    this.isConnected = false;
  }
}

export const peerNode = new CyberOpsPeerNode();
