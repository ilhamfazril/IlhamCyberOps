export interface GpsCoordinates {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface DeviceNodeData {
  id: string;
  name: string;
  platform: string;
  batteryLevel?: number;
  batteryCharging?: boolean;
  facingMode: 'user' | 'environment';
  torchOn: boolean;
  lastPing: number;
  gps?: GpsCoordinates;
  lastFrame?: string;
  fps?: number;
  online?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'command';
  source: 'node' | 'admin' | 'system';
  message: string;
}

export type CommandAction =
  | 'switch_camera'
  | 'toggle_torch'
  | 'request_snapshot'
  | 'beep'
  | 'set_stream_quality';
