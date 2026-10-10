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
  Wifi,
  WifiOff,
  Link2,
} from 'lucide-react';
import { peerNode } from '../services/peerService.ts';
import { playTacticalSound } from '../services/websocket.ts';
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
  const [targetNodeId, setTargetNodeId] = useState<string>('ILHAM-NODE-1');
  const [adminPeerId, setAdminPeerId] = useState<string>('ILHAM-ADMIN-OPS');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isCalling, setIsCalling] = useState<boolean>(false);
  const [rtt, setRtt] = useState<number | null>(null);
  const [torchState, setTorchState] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [gps, setGps] = useState<GpsCoordinates | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ lat: number; lng: number }>>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLogLevel, setFilterLogLevel] = useState<string>('all');
  const [nightVision, setNightVision] = useState<boolean>(false);
  const [showScanlines, setShowScanlines] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [showPairModal, setShowPairModal] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Initialize Admin WebRTC PeerJS
  useEffect(() => {
    addLog('Menginisialisasi WebRTC Command Center...', 'info');
    peerNode.initAdmin(adminPeerId);

    const unsubOpen = peerNode.on('open', (data) => {
      setAdminPeerId(data.id);
      addLog(`Command Center Siap (ID: ${data.id}). Menghubungkan ke ${targetNodeId}...`, 'success');
      // Auto-connect to target node
      handleConnectTarget(targetNodeId);
    });

    const unsubConnected = peerNode.on('connected', (data) => {
      setIsConnected(true);
      setIsCalling(false);
      playTacticalSound('beep');
      addLog(`BERHASIL TERHUBUNG ke ${data.peer} via WebRTC Direct Link!`, 'success');
    });

    const unsubDisconnected = peerNode.on('disconnected', (data) => {
      setIsConnected(false);
      addLog(`Koneksi terputus dari target node (${data.peer})`, 'warn');
    });

    const unsubStream = peerNode.on('remote_stream', (stream: MediaStream) => {
      addLog('Menerima WebRTC HD Live Video Stream dari sasaran!', 'success');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    });

    const unsubRtt = peerNode.on('rtt', (data) => {
      setRtt(data.rtt);
    });

    const unsubTelemetry = peerNode.on('telemetry', (data) => {
      if (data.facingMode) setFacingMode(data.facingMode);
      if (typeof data.torchOn === 'boolean') setTorchState(data.torchOn);
      if (data.battery) setBatteryLevel(data.battery.level);

      if (data.gps?.lat && data.gps?.lng) {
        setGps(data.gps);
        setBreadcrumbs((prev) => {
          const last = prev[prev.length - 1];
          if (!last || Math.abs(last.lat - data.gps.lat) > 0.00005 || Math.abs(last.lng - data.gps.lng) > 0.00005) {
            return [...prev, { lat: data.gps.lat, lng: data.gps.lng }].slice(-50);
          }
          return prev;
        });
      }
    });

    const unsubLog = peerNode.on('log', (data) => {
      if (data.message) {
        addLog(`[TARGET] ${data.message}`, data.level || 'info');
      }
    });

    return () => {
      unsubOpen();
      unsubConnected();
      unsubDisconnected();
      unsubStream();
      unsubRtt();
      unsubTelemetry();
      unsubLog();
    };
  }, []);

  const handleConnectTarget = (nodeIdToConnect: string) => {
    if (!nodeIdToConnect.trim()) return;
    setIsCalling(true);
    addLog(`Menghubungkan WebRTC ke node sasaran: ${nodeIdToConnect}...`, 'info');
    peerNode.connectToTarget(nodeIdToConnect.trim().toUpperCase());
  };

  // Remote Hardware Controls
  const handleSwitchCamera = () => {
    if (!isConnected) return;
    playTacticalSound('switch');
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);

    peerNode.send({
      type: 'command',
      action: 'switch_camera',
      facingMode: nextMode,
    });
    addLog(`[DISPATCH] Mengirim instruksi switch kamera ke: ${nextMode.toUpperCase()}`, 'command');
  };

  const handleToggleTorch = () => {
    if (!isConnected) return;
    playTacticalSound('switch');
    const nextTorch = !torchState;
    setTorchState(nextTorch);

    peerNode.send({
      type: 'command',
      action: 'toggle_torch',
      state: nextTorch,
    });
    addLog(`[DISPATCH] Mengirim instruksi lampu Flash: ${nextTorch ? 'ON' : 'OFF'}`, 'command');
  };

  const handleRemoteBeep = () => {
    if (!isConnected) return;
    playTacticalSound('alert');
    peerNode.send({
      type: 'command',
      action: 'beep',
    });
    addLog('[DISPATCH] Membunyikan Beacon Audio Alert di ponsel target', 'command');
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) return;
    playTacticalSound('beep');

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ILHAM-SNAPSHOT-${targetNodeId}-${Date.now()}.jpg`;
      link.click();
      addLog('Snapshot HD berhasil disimpan dari stream video', 'success');
    }
  };

  const handleCopyNodeLink = () => {
    const nodeUrl = `${window.location.origin}${window.location.pathname}#/node?nodeId=${targetNodeId}`;
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
                WEBRTC COMMAND HUB // CENTRAL CONSOLE
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-mono ${
                isConnected
                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                {isConnected ? 'WEBRTC LINK ACTIVE' : 'CONNECTING...'}
              </span>
              {rtt !== null && (
                <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.2 rounded bg-cyan-950/50">
                  LATENCY: {rtt}ms
                </span>
              )}
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
            Link HP Sasaran
          </button>

          {onOpenNodeClient && (
            <button
              onClick={onOpenNodeClient}
              className="px-3.5 py-2 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/50 rounded-lg text-xs font-mono flex items-center gap-2 transition-all active:scale-95"
            >
              <Smartphone className="w-3.5 h-3.5" />
              Buka Node Tab Ini
            </button>
          )}

          {onOpenGuide && (
            <button
              onClick={onOpenGuide}
              className="px-3.5 py-2 bg-[#0e1628] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-mono transition-all"
            >
              Panduan
            </button>
          )}
        </div>
      </div>

      {/* Target Node Connection Selector */}
      <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-semibold">
            <Radio className="w-4 h-4 animate-pulse" />
            TARGET NODE CONNECTION
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto font-mono text-xs">
            <span className="text-slate-400">HUBUNGKAN KE ID:</span>
            <input
              type="text"
              value={targetNodeId}
              onChange={(e) => setTargetNodeId(e.target.value.toUpperCase())}
              placeholder="ILHAM-NODE-1"
              className="bg-[#040710] border border-cyan-900 focus:border-cyan-400 rounded px-2.5 py-1 text-cyan-300 font-bold uppercase w-36 text-center"
            />
            <button
              onClick={() => handleConnectTarget(targetNodeId)}
              className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-slate-950 font-bold rounded flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <Link2 className="w-3.5 h-3.5" />
              Sambungkan
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Feed (Left) & GPS Radar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Camera Feed & Remote Controls (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-[#090e18] border border-cyan-800/40 rounded-xl p-4 corner-bracket shadow-2xl flex flex-col gap-3">
            {/* Viewport Top Header */}
            <div className="flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span>LIVE WEBRTC VIEWPORT (30 FPS HD)</span>
                <span className="text-slate-500">|</span>
                <span className={isConnected ? 'text-emerald-400' : 'text-amber-400'}>
                  {isConnected ? 'STREAMING REAL-TIME' : 'WAITING FOR TARGET...'}
                </span>
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

            {/* Video Canvas Box - Direct WebRTC Video Element */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-cyan-900/60 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  nightVision ? 'hue-rotate-90 contrast-150 saturate-200 brightness-110 filter' : ''
                }`}
              />

              {/* Placeholder when not streaming */}
              {!isConnected && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono bg-black/90 z-10">
                  <Camera className="w-12 h-12 mb-3 stroke-[1.5] text-cyan-900 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-400">MENUNGGU STREAM DARI {targetNodeId}</span>
                  <span className="text-xs text-slate-600 mt-1 max-w-xs">
                    Buka tab/HP di link sasaran lalu klik "Mulai Sesi & Izinkan Telemetri". Video 30 FPS akan langsung tayang di sini!
                  </span>
                  <button
                    onClick={() => handleConnectTarget(targetNodeId)}
                    className="mt-3 px-3 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-xs"
                  >
                    Coba Sambungkan Lagi
                  </button>
                </div>
              )}

              {/* Tactical Overlays */}
              {showScanlines && <div className="absolute inset-0 pointer-events-none scanlines opacity-40 z-20" />}

              {/* HUD Reticle */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <div className="w-16 h-16 border border-cyan-500/30 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-cyan-400/60 rounded-full" />
                </div>
                <div className="absolute top-4 left-4 text-[10px] font-mono text-cyan-400 bg-black/70 px-2 py-0.5 rounded border border-cyan-500/30">
                  TARGET: {targetNodeId}
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

            {/* HARDWARE CONTROL PANEL */}
            <div className="pt-2">
              <div className="text-[11px] font-mono text-slate-400 mb-2 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                PANEL KONTROL HARDWARE SASARAN
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                {/* 1. SWITCH CAMERA BUTTON */}
                <button
                  onClick={handleSwitchCamera}
                  disabled={!isConnected}
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
                  disabled={!isConnected}
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
                  disabled={!isConnected}
                  className="p-2.5 bg-[#0e1628] hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-300 border border-cyan-700/50 rounded-lg flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-center">SIMPAN FOTO</span>
                  <span className="text-[9px] text-emerald-500 font-mono">Snapshot HD</span>
                </button>

                {/* 4. REMOTE BEACON AUDIO CHIRP BUTTON */}
                <button
                  onClick={handleRemoteBeep}
                  disabled={!isConnected}
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
                STATUS: <strong className="text-cyan-300">{gps ? 'TRACKING LIVE' : 'MENUNGGU GPS'}</strong>
              </span>
            </div>

            {/* Leaflet Map Integration */}
            <div className="h-[360px] w-full rounded-lg overflow-hidden border border-cyan-900/60">
              <GpsMap
                gps={gps || undefined}
                breadcrumbs={breadcrumbs}
                nodeName={targetNodeId}
                className="w-full h-full"
              />
            </div>

            {/* Telemetry Detail Readout */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">LATITUDE / LONGITUDE</span>
                <span className="text-cyan-300 font-bold">
                  {gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">RADIUS AKURASI</span>
                <span className="text-emerald-400 font-bold">
                  {gps?.accuracy ? `±${Math.round(gps.accuracy)} meter` : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">BATERAI SASARAN</span>
                <span className="text-slate-200 font-bold flex items-center gap-1">
                  <Battery className="w-3.5 h-3.5 text-emerald-400" />
                  {batteryLevel !== null ? `${batteryLevel}%` : 'N/A'}
                </span>
              </div>
              <div className="bg-[#060a14] p-2 rounded border border-cyan-950">
                <span className="text-[10px] text-slate-500 block">POSISI TERAKHIR</span>
                <span className="text-slate-400">
                  {gps?.timestamp ? new Date(gps.timestamp).toLocaleTimeString() : 'Belum ada data'}
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
              Buka browser di HP sasaran Anda lalu buka link di bawah ini (atau salin tautan langsung):
            </p>

            <div className="bg-[#050811] p-3 rounded-lg border border-cyan-900/60 flex items-center justify-between gap-2">
              <code className="text-[11px] text-cyan-300 break-all select-all font-mono">
                {window.location.origin}{window.location.pathname}#/node?nodeId={targetNodeId}
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
              <div>2. Tekan <strong>"Mulai Sesi & Izinkan Telemetri"</strong>.</div>
              <div>3. Izinkan kamera & lokasi.</div>
              <div>4. Stream video 30 FPS langsung tampil di layar ini!</div>
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
