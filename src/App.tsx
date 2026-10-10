import React, { useState, useEffect } from 'react';
import { AdminCommandCenter } from './components/AdminCommandCenter.tsx';
import { DeviceNodeClient } from './components/DeviceNodeClient.tsx';
import { DocGuideModal } from './components/DocGuideModal.tsx';
import { cyberSocket } from './services/websocket.ts';
import {
  ShieldAlert,
  Smartphone,
  Terminal,
  Activity,
  HelpCircle,
  Wifi,
  WifiOff,
  Radio,
  ExternalLink,
} from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<'admin' | 'node'>('admin');
  const [wsConnected, setWsConnected] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [targetNodeId, setTargetNodeId] = useState<string>('');

  // Handle URL hash routing (#/admin vs #/node)
  useEffect(() => {
    const handleRoute = () => {
      const hash = window.location.hash;
      const search = window.location.search;

      if (hash.includes('/node') || search.includes('mode=node')) {
        setCurrentView('node');
        // Check for ?nodeId= or &nodeId=
        const match = window.location.href.match(/nodeId=([^&#]+)/);
        if (match && match[1]) {
          setTargetNodeId(decodeURIComponent(match[1]));
        }
      } else {
        setCurrentView('admin');
      }
    };

    handleRoute();
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  // Track WS connection state
  useEffect(() => {
    const unsub = cyberSocket.on('connection_change', (data) => {
      setWsConnected(data.connected);
    });
    setWsConnected(cyberSocket.isConnected);
    return () => unsub();
  }, []);

  const switchView = (view: 'admin' | 'node') => {
    window.location.hash = view === 'admin' ? '#/admin' : '#/node';
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Cyber Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#07090e]/95 backdrop-blur-md border-b border-cyan-900/40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-mono font-bold text-sm shadow-[0_0_12px_rgba(6,182,212,0.3)]">
              IO
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-bold text-base md:text-lg tracking-wider text-slate-100">
                  ILHAM CYBER-OPS
                </span>
                <span className="text-[10px] font-mono text-cyan-500 font-semibold px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40 hidden sm:inline-block">
                  v2.4
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 hidden md:block">
                TELEOPERATION & HARDWARE TELEMETRY COMMAND HUB
              </p>
            </div>
          </div>

          {/* Center: Mode Switcher Tabs */}
          <div className="flex items-center bg-[#0d1322] p-1 rounded-lg border border-cyan-900/50 text-xs font-mono">
            <button
              onClick={() => switchView('admin')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                currentView === 'admin'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
              <span>COMMAND CENTER</span>
            </button>

            <button
              onClick={() => switchView('node')}
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                currentView === 'node'
                  ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>HP NODE CLIENT</span>
            </button>
          </div>

          {/* Right: Connection Badge & Guide */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {wsConnected ? (
                <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-[11px] hidden sm:inline">LIVE LINK</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded border border-amber-500/40">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] hidden sm:inline">CONNECTING</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowGuide(true)}
              className="p-1.5 rounded text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/50 border border-transparent hover:border-cyan-800/50 transition-colors"
              title="Panduan Sistem"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="flex-1 cyber-grid relative">
        {currentView === 'admin' ? (
          <AdminCommandCenter
            onOpenNodeClient={() => switchView('node')}
            onOpenGuide={() => setShowGuide(true)}
          />
        ) : (
          <DeviceNodeClient
            initialNodeId={targetNodeId}
            onSwitchToAdmin={() => switchView('admin')}
          />
        )}
      </main>

      {/* System Documentation Modal */}
      <DocGuideModal isOpen={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
