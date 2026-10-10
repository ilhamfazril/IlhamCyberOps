import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Navigation,
  Zap,
  Radio,
  ShieldCheck,
  Smartphone,
  Battery,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Volume2,
  Power,
  Layers,
  Terminal,
} from 'lucide-react';
import { cyberSocket, playTacticalSound } from '../services/websocket.ts';
import type { GpsCoordinates, LogEntry } from '../types.ts';

interface DeviceNodeClientProps {
  initialNodeId?: string;
  onSwitchToAdmin?: () => void;
}

export const DeviceNodeClient: React.FC<DeviceNodeClientProps> = ({
  initialNodeId,
  onSwitchToAdmin,
}) => {
  const [nodeId, setNodeId] = useState(
    () => initialNodeId || localStorage.getItem('ilham_node_id') || `NODE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  );
  const [sessionActive, setSessionActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [hardwareTorchSupported, setHardwareTorchSupported] = useState(false);
  const [screenTorchActive, setScreenTorchActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsCoordinates | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [fps, setFps] = useState(8);
  const [framesSent, setFramesSent] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<any>(null);
  const geoWatchIdRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Save nodeId
  useEffect(() => {
    localStorage.setItem('ilham_node_id', nodeId);
  }, [nodeId]);

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      level,
      source: 'node',
      message,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 49)]);

    // Send log to admin
    cyberSocket.send({
      type: 'log',
      nodeId,
      level,
      message,
    });
  };

  // Battery status API
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        setIsCharging(battery.charging);

        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
        battery.addEventListener('chargingchange', () => {
          setIsCharging(battery.charging);
        });
      }).catch(() => {});
    }
  }, []);

  // Handle incoming commands from Admin
  useEffect(() => {
    const unsubCommand = cyberSocket.on('command', async (msg) => {
      addLog(`[COMMAND DITERIMA] ${msg.action?.toUpperCase()}`, 'command');
      playTacticalSound('switch');

      if (msg.action === 'switch_camera') {
        const nextFacing = msg.facingMode || (facingMode === 'user' ? 'environment' : 'user');
        await switchCamera(nextFacing);
      } else if (msg.action === 'toggle_torch') {
        const targetState = typeof msg.state === 'boolean' ? msg.state : !torchOn;
        await setTorchState(targetState);
      } else if (msg.action === 'beep') {
        playTacticalSound('alert');
        if (navigator.vibrate) {
          navigator.vibrate([200, 100, 200, 100, 400]);
        }
        addLog('Admin membunyikan Beacon Audio Alert', 'warn');
      } else if (msg.action === 'set_stream_quality') {
        if (msg.payload?.fps) {
          setFps(msg.payload.fps);
          addLog(`FPS disesuaikan ke ${msg.payload.fps} FPS`, 'info');
        }
      }
    });

    return () => {
      unsubCommand();
    };
  }, [facingMode, torchOn, nodeId]);

  // Start/Switch Camera
  const startCamera = async (mode: 'user' | 'environment') => {
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      setFacingMode(mode);

      // Check Torch capability
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
      const hasTorch = Boolean(capabilities && capabilities.torch);
      setHardwareTorchSupported(hasTorch);

      addLog(`Kamera aktif: ${mode === 'environment' ? 'BELAKANG (Environment)' : 'DEPAN (User)'}`, 'success');

      // Send telemetry update to admin
      cyberSocket.send({
        type: 'telemetry',
        nodeId,
        facingMode: mode,
        torchOn: false,
      });
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err.message || 'Gagal mengakses kamera');
      addLog(`Gagal mengakses kamera: ${err.message}`, 'error');
    }
  };

  const switchCamera = async (targetMode: 'user' | 'environment') => {
    addLog(`Mengalihkan kamera ke ${targetMode}...`, 'info');
    await startCamera(targetMode);
  };

  const setTorchState = async (state: boolean) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
      if (capabilities && capabilities.torch) {
        await (videoTrack.applyConstraints as any)({
          advanced: [{ torch: state }],
        });
        setTorchOn(state);
        setScreenTorchActive(false);
        addLog(`Lampu Flash Hardware: ${state ? 'MENYALA' : 'MATI'}`, 'success');
      } else {
        // Fallback: Screen Torch (Screen brightness simulation)
        setScreenTorchActive(state);
        setTorchOn(state);
        addLog(`Flash Layar (Screen Strobe): ${state ? 'MENYALA' : 'MATI'} (Hardware flash tidak tersedia di lensa ini)`, 'warn');
      }

      cyberSocket.send({
        type: 'telemetry',
        nodeId,
        torchOn: state,
      });
    } catch (e: any) {
      console.error('Torch error:', e);
      addLog(`Error kontrol senter: ${e.message}`, 'error');
    }
  };

  // Start GPS Geolocation
  const startGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Browser tidak mendukung Geolocation');
      addLog('Browser tidak mendukung Geolocation', 'error');
      return;
    }

    setGpsError(null);
    geoWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GpsCoordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
        };
        setGps(coords);

        // Transmit coordinates to admin
        cyberSocket.send({
          type: 'telemetry',
          nodeId,
          gps: coords,
          battery: batteryLevel ? { level: batteryLevel, charging: isCharging } : undefined,
        });
      },
      (error) => {
        console.warn('GPS error:', error);
        setGpsError(error.message);
        addLog(`GPS Warning: ${error.message}`, 'warn');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );
    addLog('Pemantauan GPS Presisi Tinggi diaktifkan', 'success');
  };

  // Start Frame capture loop
  const startFrameStream = () => {
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 480;
      canvasRef.current.height = 360;
    }

    const intervalMs = Math.round(1000 / fps);
    frameIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.6);

      cyberSocket.send({
        type: 'frame',
        nodeId,
        image: dataUrl,
        payload: { fps },
      });

      setFramesSent((c) => c + 1);
    }, intervalMs);
  };

  // Main start handler
  const handleStartSession = async () => {
    setSessionActive(true);
    playTacticalSound('beep');

    // Connect to WebSocket
    cyberSocket.connect('node', nodeId, {
      name: `HP-${nodeId.slice(-4)}`,
      platform: navigator.userAgent.includes('Android') ? 'Android' : navigator.userAgent.includes('iPhone') ? 'iOS' : 'Web Client',
      facingMode,
      battery: { level: batteryLevel, charging: isCharging },
    });

    addLog('Menghubungkan ke Pusat Komando ILHAM CYBER-OPS...', 'info');

    // Request camera and GPS
    await startCamera(facingMode);
    startGps();
    startFrameStream();
  };

  // Stop handler
  const handleStopSession = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (geoWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchIdRef.current);
      geoWatchIdRef.current = null;
    }
    setTorchOn(false);
    setScreenTorchActive(false);
    setSessionActive(false);
    addLog('Sesi teleoperasi dihentikan oleh pengguna', 'warn');
  };

  return (
    <div className="relative min-h-[calc(100vh-64px)] p-4 md:p-6 max-w-4xl mx-auto flex flex-col gap-6">
      {/* Screen Torch Simulation Overlay (fills screen with 100% white max brightness) */}
      {screenTorchActive && (
        <div
          onClick={() => setScreenTorchActive(false)}
          className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-black select-none cursor-pointer"
        >
          <Zap className="w-16 h-16 animate-bounce text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold font-mono tracking-widest text-center">SCREEN TORCH AKTIF</h2>
          <p className="text-sm text-neutral-600 mt-2 text-center max-w-md">
            Lampu senter layar dinyalakan untuk penerangan. Sentuh layar di mana saja untuk mematikan.
          </p>
        </div>
      )}

      {/* Top Banner & Device Identity */}
      <div className="bg-[#0b101d] border border-cyan-800/40 rounded-xl p-5 corner-bracket shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-cyan-500 font-mono font-semibold">
                  FIELD EXPERIMENT NODE
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 font-mono">
                  <span className={`w-2 h-2 rounded-full ${sessionActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
                  {sessionActive ? 'ONLINE & STREAMING' : 'STANDBY'}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold font-heading text-slate-100 flex items-center gap-2">
                ILHAM CYBER-OPS // NODE CLIENT
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:flex-initial flex items-center gap-2 bg-[#060a14] px-3 py-1.5 rounded border border-cyan-900/40 text-xs font-mono">
              <span className="text-slate-500">ID:</span>
              <input
                type="text"
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value.toUpperCase())}
                disabled={sessionActive}
                className="bg-transparent text-cyan-400 font-bold focus:outline-none w-28 uppercase"
              />
            </div>
          </div>
        </div>

        {/* Clear Transparent Consent Declaration */}
        <div className="mt-4 p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-xs leading-relaxed text-slate-300 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-cyan-300 font-semibold block mb-0.5">
              Transparansi Akses & Izin Perangkat
            </strong>
            Halaman ini bertindak sebagai perpanjangan perangkat (*Node*) untuk eksperimen teleoperasi pribadi. 
            Saat Anda menekan tombol aktifkan, browser akan meminta izin Kamera dan GPS. 
            Operator di Pusat Komando Admin dapat memantau feed kamera secara langsung, melacak koordinat GPS, 
            mengubah lensa kamera depan/belakang, serta mengoperasikan saklar senter (flash).
          </div>
        </div>
      </div>

      {/* Main Control & Viewport Area */}
      {!sessionActive ? (
        <div className="bg-[#0b101d] border border-cyan-800/40 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-6 shadow-xl">
          <div className="w-20 h-20 rounded-full bg-cyan-950/60 border-2 border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.2)]">
            <Radio className="w-10 h-10 animate-pulse" />
          </div>

          <div className="max-w-md">
            <h2 className="text-xl font-bold font-heading text-slate-100 mb-2">
              Siap Menghubungkan Perangkat
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed font-mono">
              Pastikan Anda menyetujui prompt izin browser untuk Kamera dan Lokasi saat memulai. 
              Status koneksi dan telemetri akan langsung terhubung ke Pusat Komando.
            </p>
          </div>

          <button
            onClick={handleStartSession}
            className="px-8 py-3.5 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-slate-950 font-bold text-sm tracking-wider uppercase rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all active:scale-95 flex items-center gap-2"
          >
            <Power className="w-4 h-4" />
            Mulai Sesi & Izinkan Telemetri
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Local Camera Viewport */}
          <div className="bg-[#0b101d] border border-cyan-800/40 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                <Camera className="w-4 h-4" />
                LOCAL CAMERA PREVIEW
              </span>
              <span className="text-slate-400">
                LENSA: <strong className="text-cyan-300">{facingMode === 'user' ? 'DEPAN' : 'BELAKANG'}</strong>
              </span>
            </div>

            {/* Video Box */}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-cyan-900/60 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Viewport Overlay */}
              <div className="absolute inset-0 pointer-events-none scanlines opacity-50" />
              <div className="absolute top-2 left-2 text-[10px] font-mono bg-black/70 px-2 py-0.5 rounded text-emerald-400 border border-emerald-500/30">
                LIVE FEED · {fps} FPS
              </div>

              {torchOn && (
                <div className="absolute top-2 right-2 text-[10px] font-mono bg-amber-950/80 px-2 py-0.5 rounded text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-amber-400 text-amber-400" />
                  FLASH AKTIF
                </div>
              )}
            </div>

            {/* Local Manual Quick Controls */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => switchCamera(facingMode === 'user' ? 'environment' : 'user')}
                className="px-3 py-2 bg-[#0e1626] hover:bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 rounded text-xs font-mono flex items-center justify-center gap-2 transition-colors active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Ganti Kamera
              </button>

              <button
                onClick={() => setTorchState(!torchOn)}
                className={`px-3 py-2 border rounded text-xs font-mono flex items-center justify-center gap-2 transition-colors active:scale-95 ${
                  torchOn
                    ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                    : 'bg-[#0e1626] hover:bg-cyan-950/60 border-cyan-800/50 text-slate-300'
                }`}
              >
                <Zap className={`w-3.5 h-3.5 ${torchOn ? 'fill-amber-400' : ''}`} />
                {torchOn ? 'Matikan Flash' : 'Nyalakan Flash'}
              </button>
            </div>

            {cameraError && (
              <div className="text-xs text-rose-400 bg-rose-950/30 p-2 rounded border border-rose-900/50 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>

          {/* Right Column: Telemetry Gauges & Activity Stream */}
          <div className="flex flex-col gap-4">
            {/* Sensor Status Card */}
            <div className="bg-[#0b101d] border border-cyan-800/40 rounded-xl p-4 shadow-xl">
              <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-3 flex items-center gap-1.5">
                <Radio className="w-4 h-4" />
                STATUS TELEMETRI PERANGKAT
              </h3>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-[#060a14] p-2.5 rounded border border-cyan-900/40">
                  <span className="text-slate-500 block text-[10px]">KOORDINAT GPS</span>
                  <span className="text-cyan-300 font-semibold">
                    {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'Mencari sinyal...'}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Akurasi: ±{gps?.accuracy ? Math.round(gps.accuracy) : 0}m
                  </span>
                </div>

                <div className="bg-[#060a14] p-2.5 rounded border border-cyan-900/40">
                  <span className="text-slate-500 block text-[10px]">DAYA BATERAI</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Battery className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">
                      {batteryLevel !== null ? `${batteryLevel}%` : 'N/A'}
                    </span>
                    {isCharging && <span className="text-[10px] text-amber-400">(Charging)</span>}
                  </div>
                </div>

                <div className="bg-[#060a14] p-2.5 rounded border border-cyan-900/40">
                  <span className="text-slate-500 block text-[10px]">FRAME TERKIRIM</span>
                  <span className="text-slate-200 font-semibold">{framesSent} packet</span>
                </div>

                <div className="bg-[#060a14] p-2.5 rounded border border-cyan-900/40">
                  <span className="text-slate-500 block text-[10px]">HARDWARE SENTER</span>
                  <span className={hardwareTorchSupported ? 'text-emerald-400' : 'text-amber-400'}>
                    {hardwareTorchSupported ? 'Tersedia di lensa ini' : 'Screen Torch Mode'}
                  </span>
                </div>
              </div>

              {gpsError && (
                <div className="mt-3 text-xs text-amber-400 bg-amber-950/20 p-2 rounded border border-amber-900/50">
                  {gpsError}
                </div>
              )}
            </div>

            {/* Command & Activity Log */}
            <div className="bg-[#0b101d] border border-cyan-800/40 rounded-xl p-4 flex-1 flex flex-col shadow-xl">
              <h3 className="text-xs font-mono font-semibold text-cyan-400 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4" />
                  LOG PERINTAH MASUK DARI ADMIN
                </span>
                <span className="text-[10px] text-slate-500">{logs.length} entri</span>
              </h3>

              <div className="h-44 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <div className="text-slate-600 text-center py-8">
                    Menunggu instruksi dari Pusat Komando...
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`p-1.5 rounded border ${
                        log.level === 'command'
                          ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                          : log.level === 'warn'
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                          : log.level === 'error'
                          ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                          : 'bg-[#060a14] border-cyan-900/30 text-slate-400'
                      }`}
                    >
                      <span className="text-[10px] text-slate-500 mr-2">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      {log.message}
                    </div>
                  ))
                )}
              </div>

              <div className="pt-3 border-t border-cyan-950/60 mt-3 flex items-center justify-between">
                <button
                  onClick={handleStopSession}
                  className="px-4 py-2 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 rounded text-xs font-mono transition-colors active:scale-95 flex items-center gap-2"
                >
                  <Power className="w-3.5 h-3.5" />
                  Hentikan Sesi Node
                </button>

                {onSwitchToAdmin && (
                  <button
                    onClick={onSwitchToAdmin}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-mono underline underline-offset-4"
                  >
                    Buka Command Center →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
