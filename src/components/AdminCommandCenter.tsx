import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Camera,
  RotateCcw,
  Zap,
  Volume2,
  Navigation,
  Activity,
  Terminal,
  Crosshair,
  Download,
  Eye,
  Sliders,
  Copy,
  Check,
  RefreshCw,
  QrCode,
  Laptop,
  Smartphone,
  Battery,
  Radio,
  Share2,
  Lock,
} from 'lucide-react';
import { cyberSocket, playTacticalSound } from '../services/websocket.ts';
import { GpsMap } from './GpsMap.tsx';
import type { DeviceNodeData, LogEntry, GpsCoordinates } from '../types.ts';

interface AdminCommandCenterProps {
  onOpenNodeClient?: () => void;
  onOpenGuide?: () => void;
}

export const AdminCommandCenter: React.FC<AdminCommandCenterProps> = ({
  onOpenNodeClient,
  onOpenGuide,
}) => {
  const [devices, setDevices] = useState<DeviceNodeData[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [torchState, setTorchState] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ lat: number; lng: number }>>([]);
  const [filterLogLevel, setFilterLogLevel] = useState<string>('all');
  const [nightVision, setNightVision] = useState(false);
  const [showScanlines, setShowScanlines] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPairModal, setShowPairModal] = useState(false);
  const [targetPairCode, setTargetPairCode] = useState('ILHAM-77');

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);

  // Audio chirp on incoming telemetry
  const lastPingRef = useRef<number>(0);

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      source: 'admin',
      message,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 99)]);
  };

  // Connect as Admin
  useEffect(() => {
    cyberSocket.connect('admin', 'admin-console', {});

    // Immediate REST fetch for devices
    fetch('/api/devices')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.devices)) {
          setDevices(data.devices);
          if (data.devices.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(data.devices[0].id);
          }
        }
      })
      .catch(() => {});

    // Periodic sync poll as fallback
    const syncInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/devices');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.devices)) {
            setDevices(data.devices);
            if (selectedDeviceId) {
              const current = data.devices.find((d: any) => d.id === selectedDeviceId);
              if (current) {
                if (current.lastFrame) setCurrentFrame(current.lastFrame);
                if (current.fps) setCurrentFps(current.fps);
                if (typeof current.torchOn === 'boolean') setTorchState(current.torchOn);
                if (current.facingMode) setFacingMode(current.facingMode);
              }
            } else if (data.devices.length > 0) {
              setSelectedDeviceId(data.devices[0].id);
            }
          }
        }
      } catch (e) {}
    }, 1500);

    // Listen to device list & updates
    const unsubDevices = cyberSocket.on('devices_list', (msg) => {
      if (Array.isArray(msg.payload)) {
        setDevices(msg.payload);
        if (msg.payload.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(msg.payload[0].id);
        }
      }
    });

    const unsubAdminReg = cyberSocket.on('admin_registered', (msg) => {
      addLog('Sistem terhubung ke Pusat Komando ILHAM CYBER-OPS', 'success');
      if (Array.isArray(msg.payload?.devices)) {
        setDevices(msg.payload.devices);
        if (msg.payload.devices.length > 0) {
          setSelectedDeviceId(msg.payload.devices[0].id);
        }
      }
    });

    const unsubNodeJoined = cyberSocket.on('node_joined', (msg) => {
      playTacticalSound('beep');
      addLog(`Perangkat baru terdeteksi: ${msg.nodeId} (${msg.payload?.name || 'Mobile Node'})`, 'success');
      setDevices((prev) => {
        const filtered = prev.filter((d) => d.id !== msg.nodeId);
        return [...filtered, msg.payload];
      });
      setSelectedDeviceId(msg.nodeId);
    });

    const unsubNodeTelemetry = cyberSocket.on('node_telemetry', (msg) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === msg.nodeId) {
            return {
              ...d,
              lastPing: msg.timestamp || Date.now(),
              gps: msg.gps || d.gps,
              batteryLevel: msg.battery?.level ?? d.batteryLevel,
              batteryCharging: msg.battery?.charging ?? d.batteryCharging,
              facingMode: msg.facingMode || d.facingMode,
              torchOn: typeof msg.torchOn === 'boolean' ? msg.torchOn : d.torchOn,
              online: true,
            };
          }
          return d;
        })
      );

      // If this is the active selected device, update local states & breadcrumbs
      if (msg.nodeId === selectedDeviceId) {
        if (msg.gps?.lat && msg.gps?.lng) {
          setBreadcrumbs((prev) => {
            const last = prev[prev.length - 1];
            if (!last || Math.abs(last.lat - msg.gps.lat) > 0.00005 || Math.abs(last.lng - msg.gps.lng) > 0.00005) {
              return [...prev, { lat: msg.gps.lat, lng: msg.gps.lng }].slice(-50);
            }
            return prev;
          });
        }
        if (typeof msg.torchOn === 'boolean') setTorchState(msg.torchOn);
        if (msg.facingMode) setFacingMode(msg.facingMode);
      }
    });

    const unsubNodeFrame = cyberSocket.on('node_frame', (msg) => {
      if (msg.nodeId === selectedDeviceId) {
        setCurrentFrame(msg.image);
        if (msg.fps) setCurrentFps(msg.fps);
      }
    });

    const unsubNodeStatus = cyberSocket.on('node_status', (msg) => {
      setDevices((prev) =>
        prev.map((d) => (d.id === msg.nodeId ? { ...d, online: msg.payload?.online ?? false } : d))
      );
      addLog(`Status node ${msg.nodeId}: ${msg.payload?.online ? 'Online' : 'Offline'}`, 'warn');
    });

    const unsubLogs = cyberSocket.on('log', (msg) => {
      if (msg.message) {
        addLog(`[${msg.nodeId || 'SYSTEM'}] ${msg.message}`, msg.level || 'info');
      }
    });

    return () => {
      clearInterval(syncInterval);
      unsubDevices();
      unsubAdminReg();
      unsubNodeJoined();
      unsubNodeTelemetry();
      unsubNodeFrame();
      unsubNodeStatus();
      unsubLogs();
    };
  }, [selectedDeviceId]);

  // Sync state when selected device changes
  useEffect(() => {
    if (selectedDevice) {
      if (selectedDevice.facingMode) setFacingMode(selectedDevice.facingMode);
      if (typeof selectedDevice.torchOn === 'boolean') setTorchState(selectedDevice.torchOn);
      if (selectedDevice.lastFrame) setCurrentFrame(selectedDevice.lastFrame);
      if (selectedDevice.gps) {
        setBreadcrumbs([{ lat: selectedDevice.gps.lat, lng: selectedDevice.gps.lng }]);
      }
    }
  }, [selectedDeviceId]);

  // Remote Commands
  const handleSwitchCamera = () => {
    if (!selectedDeviceId) return;
    playTacticalSound('switch');
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    cyberSocket.send({
      type: 'command',
      targetId: selectedDeviceId,
      action: 'switch_camera',
      facingMode: nextMode,
    });
    addLog(`[DISPATCH] Ganti lensa kamera target ke: ${nextMode.toUpperCase()}`, 'command');
  };

  const handleToggleTorch = () => {
    if (!selectedDeviceId) return;
    playTacticalSound('switch');
    const nextTorch = !torchState;
    setTorchState(nextTorch);

    cyberSocket.send({
      type: 'command',
      targetId: selectedDeviceId,
      action: 'toggle_torch',
      state: nextTorch,
    });
    addLog(`[DISPATCH] Saklar lampu Flash target: ${nextTorch ? 'ON' : 'OFF'}`, 'command');
  };

  const handleRemoteBeep = () => {
    if (!selectedDeviceId) return;
    playTacticalSound('alert');
    cyberSocket.send({
      type: 'command',
      targetId: selectedDeviceId,
      action: 'beep',
    });
    addLog(`[DISPATCH] Mengirim Beacon Audio Alert ke perangkat target`, 'command');
  };

  const handleCaptureSnapshot = () => {
    if (!currentFrame) return;
    playTacticalSound('beep');
    const link = document.createElement('a');
    link.href = currentFrame;
    link.download = `ILHAM-SNAPSHOT-${selectedDeviceId}-${Date.now()}.jpg`;
    link.click();
    addLog(`[SNAPSHOT] Berhasil mengunduh tangkapan layar resolusi tinggi`, 'success');
  };

  const handleCopyNodeLink = () => {
    const nodeUrl = `${window.location.origin}${window.location.pathname}#/node?nodeId=${targetPairCode}`;
    navigator.clipboard.writeText(nodeUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    addLog(`Link URL Node Client disalin ke clipboard`, 'info');
  };

  const filteredLogs = logs.filter((l) => {
    if (filterLogLevel === 'all') return true;
    return l.level === filterLogLevel;
  });

  return (
    <div className="min-h-[calc(100vh-64px)] p-4 md:p-6 max-w-7xl mx-auto flex flex-col gap-6">
      {/* Top Tactical Status Bar */}
      <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 corner-bracket shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Crosshair className="w-6 h-6 animate-spin" style={{ animationDuration: '8s' }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-cyan-400 font-mono font-bold">
                COMMAND HUB // CENTRAL CONSOLE
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                ACTIVE LINK
              </span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-heading text-slate-100">
              ILHAM CYBER-OPS COMMAND CENTER
            </h1>
          </div>
        </div>

        {/* Quick Action Tools */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            onClick={() => setShowPairModal(true)}
            className="px-3.5 py-2 bg-[#0e1628] hover:bg-cyan-950/70 text-cyan-300 border border-cyan-700/50 rounded-lg text-xs font-mono flex items-center gap-2 transition-all active:scale-95 shadow-md"
          >
            <Share2 className="w-3.5 h-3.5" />
            Hubungkan HP Sasaran
          </button>

          {onOpenNodeClient && (
            <button
              onClick={onOpenNodeClient}
              className="px-3.5 py-2 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/50 rounded-lg text-xs font-mono flex items-center gap-2 transition-all active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Buka Node di Tab Ini
            </button>
          )}

          {onOpenGuide && (
            <button
              onClick={onOpenGuide}
              className="px-3.5 py-2 bg-[#0e1628] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono transition-all"
            >
              Panduan Pemakaian
            </button>
          )}
        </div>
      </div>

      {/* Target Selector & Status Strips */}
      <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
            <Radio className="w-4 h-4 animate-pulse" />
            DAFTAR PERANGKAT SASARAN TERDETEKSI ({devices.length})
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            PILIH PERANGKAT DI BAWAH UNTUK KONTROL TELEOPERASI
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="p-4 bg-[#050811] rounded-lg border border-dashed border-cyan-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <span>Belum ada perangkat sasaran yang terhubung. Buka halaman Node di HP Anda untuk menghubungkan.</span>
            </div>
            <button
              onClick={() => setShowPairModal(true)}
              className="px-3 py-1.5 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded text-xs hover:bg-cyan-900 transition-colors"
            >
              Lihat Link HP →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {devices.map((dev) => {
              const isSelected = dev.id === selectedDeviceId;
              return (
                <button
                  key={dev.id}
                  onClick={() => setSelectedDeviceId(dev.id)}
                  className={`p-3 rounded-lg border text-left transition-all font-mono relative overflow-hidden ${
                    isSelected
                      ? 'bg-cyan-950/60 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                      : 'bg-[#060a14] hover:bg-[#0a101f] border-cyan-900/40 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      {dev.name || dev.id}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <div>PLATFORM: <strong className="text-slate-200">{dev.platform}</strong></div>
                    <div>BATERAI: <strong className="text-emerald-400">{dev.batteryLevel ? `${dev.batteryLevel}%` : 'N/A'}</strong></div>
                    <div>LENSA: <strong className="text-cyan-300">{dev.facingMode === 'user' ? 'DEPAN' : 'BELAKANG'}</strong></div>
                  </div>
                  {isSelected && (
                    <div className="absolute top-0 right-0 w-2 h-2 bg-cyan-400" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid: Live Feed (Left) & GPS Radar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Camera Feed & Remote Controls (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Video Viewport Container */}
          <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 corner-bracket shadow-2xl flex flex-col gap-3">
            {/* Viewport Top Header */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span>LIVE FEED VIEWPORT</span>
                <span className="text-slate-500">|</span>
                <span className="text-emerald-400">{currentFps > 0 ? `${currentFps} FPS` : 'STREAM STANDBY'}</span>
              </div>

              {/* Viewport display filters */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNightVision(!nightVision)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    nightVision
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                      : 'bg-[#060a14] text-slate-400 border-slate-700'
                  }`}
                >
                  NIGHT VISION
                </button>
                <button
                  onClick={() => setShowScanlines(!showScanlines)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    showScanlines
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                      : 'bg-[#060a14] text-slate-400 border-slate-700'
                  }`}
                >
                  SCANLINES
                </button>
              </div>
            </div>

            {/* Video Canvas Box */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-cyan-900/60 flex items-center justify-center">
              {currentFrame ? (
                <img
                  src={currentFrame}
                  alt="Live Target Feed"
                  className={`w-full h-full object-cover ${
                    nightVision ? 'hue-rotate-90 contrast-150 saturate-200 brightness-110 filter' : ''
                  }`}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono">
                  <Camera className="w-12 h-12 mb-3 stroke-[1.5] text-cyan-900" />
                  <span className="text-sm font-semibold text-slate-400">TIDAK ADA FEED AKTIF</span>
                  <span className="text-xs text-slate-600 mt-1 max-w-xs">
                    Pilih target atau pastikan perangkat HP sasaran telah menekan tombol "Mulai Sesi".
                  </span>
                </div>
              )}

              {/* Tactical Overlays */}
              {showScanlines && <div className="absolute inset-0 pointer-events-none scanlines opacity-40" />}

              {/* HUD Reticle */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-16 h-16 border border-cyan-500/30 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-cyan-400/60 rounded-full" />
                </div>
                <div className="absolute top-4 left-4 text-[10px] font-mono text-cyan-400 bg-black/70 px-2 py-0.5 rounded border border-cyan-500/30">
                  REC // {selectedDeviceId || 'NO-TARGET'}
                </div>
                <div className="absolute bottom-4 left-4 text-[10px] font-mono text-slate-300 bg-black/70 px-2 py-0.5 rounded border border-cyan-900/60">
                  LENSA: <span className="text-cyan-300 font-bold">{facingMode === 'user' ? 'KAMERA DEPAN' : 'KAMERA BELAKANG'}</span>
                </div>
                <div className="absolute top-4 right-4 text-[10px] font-mono bg-black/70 px-2 py-0.5 rounded border border-cyan-900/60 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${torchState ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
                  <span className={torchState ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                    FLASH: {torchState ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>

            {/* HARDWARE CONTROL PANEL (Controls required by brief) */}
            <div className="pt-2">
              <div className="text-[11px] font-mono text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                PANEL KONTROL HARDWARE SASARAN
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {/* 1. SWITCH CAMERA BUTTON */}
                <button
                  onClick={handleSwitchCamera}
                  disabled={!selectedDeviceId}
                  className="p-2.5 bg-gradient-to-r from-cyan-950/80 to-blue-950/80 hover:from-cyan-900 hover:to-blue-900 text-cyan-300 border border-cyan-600/50 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <RotateCcw className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-center">SWITCH KAMERA</span>
                  <span className="text-[9px] text-cyan-500 font-mono">
                    {facingMode === 'user' ? 'Ke Belakang' : 'Ke Depan'}
                  </span>
                </button>

                {/* 2. FLASH / TORCH TOGGLE BUTTON */}
                <button
                  onClick={handleToggleTorch}
                  disabled={!selectedDeviceId}
                  className={`p-2.5 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md border ${
                    torchState
                      ? 'bg-amber-950/90 hover:bg-amber-900 border-amber-400 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : 'bg-[#0e1628] hover:bg-cyan-950/60 border-cyan-700/50 text-slate-300'
                  }`}
                >
                  <Zap className={`w-4 h-4 ${torchState ? 'text-amber-400 fill-amber-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className="font-semibold text-center">
                    {torchState ? 'MATIKAN FLASH' : 'NYALAKAN FLASH'}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {torchState ? 'State: Active' : 'State: Off'}
                  </span>
                </button>

                {/* 3. CAPTURE SNAPSHOT BUTTON */}
                <button
                  onClick={handleCaptureSnapshot}
                  disabled={!currentFrame}
                  className="p-2.5 bg-[#0e1628] hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-cyan-700/50 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-center">SIMPAN FOTO</span>
                  <span className="text-[9px] text-emerald-500 font-mono">Snapshot HD</span>
                </button>

                {/* 4. REMOTE BEACON AUDIO CHIRP BUTTON */}
                <button
                  onClick={handleRemoteBeep}
                  disabled={!selectedDeviceId}
                  className="p-2.5 bg-[#0e1628] hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-cyan-700/50 hover:border-rose-700/50 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <Volume2 className="w-4 h-4 text-rose-400" />
                  <span className="font-semibold text-center">BUNYIKAN BEACON</span>
                  <span className="text-[9px] text-rose-500 font-mono">Audio Alert</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Leaflet GPS Tactical Radar (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 corner-bracket shadow-2xl flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-cyan-400" />
                TACTICAL GPS RADAR TRACKER
              </span>
              <span className="text-slate-400">
                STATUS: <strong className="text-cyan-300">{selectedDevice?.gps ? 'TRACKING LIVE' : 'MENUNGGU GPS'}</strong>
              </span>
            </div>

            {/* Leaflet Map Integration */}
            <div className="h-[360px] w-full rounded-lg overflow-hidden border border-cyan-900/60">
              <GpsMap
                gps={selectedDevice?.gps}
                breadcrumbs={breadcrumbs}
                nodeName={selectedDevice?.name || selectedDeviceId}
                className="w-full h-full"
              />
            </div>

            {/* Telemetry Detail Readout */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">LATITUDE / LONGITUDE</span>
                <span className="text-cyan-300 font-bold">
                  {selectedDevice?.gps
                    ? `${selectedDevice.gps.lat.toFixed(5)}, ${selectedDevice.gps.lng.toFixed(5)}`
                    : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">RADIUS AKURASI</span>
                <span className="text-emerald-400 font-bold">
                  {selectedDevice?.gps?.accuracy ? `±${Math.round(selectedDevice.gps.accuracy)} meter` : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">BATERAI PERANGKAT</span>
                <span className="text-slate-200 font-bold flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5 text-emerald-400" />
                  {selectedDevice?.batteryLevel ? `${selectedDevice.batteryLevel}%` : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">POSISI TERAKHIR</span>
                <span className="text-slate-400">
                  {selectedDevice?.gps?.timestamp
                    ? new Date(selectedDevice.gps.timestamp).toLocaleTimeString()
                    : 'Belum ada data'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Terminal Console & Server Event Log */}
      <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 corner-bracket shadow-2xl flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-cyan-400">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>CENTRAL SYSTEM EVENT LOG</span>
            <span className="text-[10px] text-slate-500">({filteredLogs.length} events)</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span className="text-slate-500 mr-1">FILTER:</span>
            {['all', 'command', 'success', 'warn', 'error'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLogLevel(lvl)}
                className={`px-2 py-0.5 rounded uppercase text-[10px] transition-colors ${
                  filterLogLevel === lvl
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
            <button
              onClick={() => setLogs([])}
              className="ml-2 text-slate-500 hover:text-rose-400 text-[10px] underline"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="h-44 overflow-y-auto bg-[#04060c] p-3 rounded-lg border border-cyan-950 font-mono text-[11px] space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-8">
              Belum ada log server yang tercatat. Sistem siap memproses event.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-slate-500 shrink-0">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span
                  className={`font-semibold shrink-0 uppercase text-[10px] px-1 py-0.2 rounded ${
                    log.level === 'command'
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-600/40'
                      : log.level === 'success'
                      ? 'bg-emerald-950 text-emerald-300'
                      : log.level === 'warn'
                      ? 'bg-amber-950 text-amber-300'
                      : log.level === 'error'
                      ? 'bg-rose-950 text-rose-300'
                      : 'text-slate-400'
                  }`}
                >
                  {log.level}
                </span>
                <span
                  className={
                    log.level === 'command'
                      ? 'text-cyan-200'
                      : log.level === 'warn'
                      ? 'text-amber-200'
                      : log.level === 'error'
                      ? 'text-rose-300'
                      : 'text-slate-300'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Pairing & Connection Modal */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-cyan-500/50 rounded-xl p-6 max-w-md w-full corner-bracket shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-cyan-950 pb-3">
              <h3 className="text-base font-bold font-heading text-slate-100 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-cyan-400" />
                HUBUNGKAN HP SASARAN
              </h3>
              <button
                onClick={() => setShowPairModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-mono">
              Buka browser di HP sasaran Anda lalu masukkan URL berikut (atau salin tautan langsung):
            </p>

            <div className="bg-[#050811] p-3 rounded-lg border border-cyan-900/60 flex items-center justify-between gap-2">
              <code className="text-[11px] text-cyan-300 break-all select-all font-mono">
                {window.location.origin}{window.location.pathname}#/node?nodeId={targetPairCode}
              </code>
              <button
                onClick={handleCopyNodeLink}
                className="p-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/50 rounded shrink-0 transition-colors"
                title="Salin Tautan"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-lg text-xs text-slate-400 space-y-1 font-mono">
              <div>1. Buka tautan di atas pada HP Anda.</div>
              <div>2. Klik tombol <strong>"Mulai Sesi & Izinkan Telemetri"</strong>.</div>
              <div>3. Setujui izin kamera dan lokasi (hanya 1x di awal).</div>
              <div>4. Perangkat otomatis muncul di Command Center ini!</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPairModal(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
