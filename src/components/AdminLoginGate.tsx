import React, { useState } from 'react';
import {
  Lock,
  Unlock,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Terminal,
  AlertOctagon,
  CheckCircle2,
} from 'lucide-react';
import { authenticateAdmin, playTacticalSound } from '../services/websocket.ts';

interface AdminLoginGateProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

export const AdminLoginGate: React.FC<AdminLoginGateProps> = ({ onSuccess, onCancel }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [granted, setGranted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Masukkan password otentikasi');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const res = await authenticateAdmin(password.trim());
    setIsLoading(false);

    if (res.success) {
      playTacticalSound('beep');
      setGranted(true);
      setTimeout(() => {
        onSuccess();
      }, 700);
    } else {
      playTacticalSound('alert');
      setErrorMsg(res.message);
    }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#090e18] border border-cyan-800/60 rounded-xl p-6 sm:p-8 corner-bracket shadow-2xl relative overflow-hidden">
        {/* Glow behind */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-12 bg-cyan-500/10 blur-2xl pointer-events-none" />

        {/* Top Icon & Title */}
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <div className="w-16 h-16 rounded-xl bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
            {granted ? (
              <Unlock className="w-8 h-8 text-emerald-400 animate-bounce" />
            ) : (
              <Lock className="w-8 h-8 text-cyan-400" />
            )}
          </div>

          <div>
            <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400 uppercase">
              SECURITY PROTOCOL // LEVEL 5
            </span>
            <h2 className="text-xl sm:text-2xl font-bold font-heading text-slate-100 tracking-wide mt-1">
              COMMAND CENTER CLEARANCE
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Masukkan kode otorisasi untuk mengakses kendali penuh.
            </p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 font-mono text-xs">
          <div>
            <label className="text-slate-300 font-semibold mb-1.5 block flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                PASSWORD ADMIN:
              </span>
              <span className="text-[10px] text-slate-500">AUTH REQUIRED</span>
            </label>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan Password..."
                disabled={isLoading || granted}
                className="w-full bg-[#050811] border border-cyan-900/70 focus:border-cyan-400 rounded-lg px-3.5 py-3 text-cyan-200 placeholder-slate-600 focus:outline-none transition-all pr-10 text-sm tracking-wide"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-rose-300 text-xs flex items-center gap-2 animate-shake">
              <AlertOctagon className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {granted && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-600/60 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>AKSES DITERIMA. MEMBUKA COMMAND CENTER...</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || granted}
            className="w-full mt-2 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-lg transition-all active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>MEMVERIFIKASI...</span>
            ) : granted ? (
              <span>OTORISASI DITERIMA</span>
            ) : (
              <span>OTORISASI MASUK</span>
            )}
          </button>
        </form>

        {/* Hint banner */}
        <div className="mt-6 pt-4 border-t border-cyan-950/80 text-center">
          <span className="text-[11px] font-mono text-slate-500">
            Kredensial Otoritas Admin: <strong className="text-cyan-400">Ilhamfazril</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
