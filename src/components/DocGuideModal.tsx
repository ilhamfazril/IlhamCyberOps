import React from 'react';
import {
  BookOpen,
  Camera,
  Zap,
  Navigation,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  ExternalLink,
} from 'lucide-react';

interface DocGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocGuideModal: React.FC<DocGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0b101e] border border-cyan-500/50 rounded-xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto corner-bracket shadow-2xl flex flex-col gap-6 text-slate-200 font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cyan-950 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold font-heading text-slate-100">
              PANDUAN SISTEM // ILHAM CYBER-OPS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-sm font-mono px-2 py-1"
          >
            ✕ TUTUP
          </button>
        </div>

        {/* Section 1: Konsep & Izin Transparan */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2 font-heading">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            1. Transparansi & Konsep Izin Sekali Persetujuan
          </h3>
          <p className="leading-relaxed text-slate-300">
            Aplikasi ini dirancang sebagai platform eksperimen teleoperasi perangkat pribadi. HP sasaran tidak disamarkan, melainkan secara transparan diinformasikan bahwa perangkat tersebut terhubung ke Pusat Komando ILHAM CYBER-OPS.
          </p>
          <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-lg space-y-1.5 text-slate-400">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong>Hanya 1x Izin di Awal:</strong> Saat HP menekan <em>"Mulai Sesi & Izinkan Telemetri"</em>, browser meminta izin Kamera & Lokasi. Setelah diberikan, sesi berjalan terus menerus.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>
                <strong>Eksekusi Otomatis dari Admin:</strong> Perintah Admin (Nyalakan Flash, Ganti Kamera Depan/Belakang, Audio Beacon) dieksekusi secara instan di latar belakang tanpa meminta dialog popup baru di HP sasaran!
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Cara Menghubungkan HP Sasaran */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2 font-heading">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            2. Cara Menghubungkan HP Sasaran & Akses Command Center
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-slate-300 leading-relaxed">
            <li>Di Laptop, buka <strong>Command Center</strong> (<code>#/admin</code>) lalu masukkan Password Otorisasi: <strong className="text-cyan-400">Ilhamfazril</strong>.</li>
            <li>Di HP, buka link aplikasi dengan akhiran <code>#/node</code> (ID bawaan: <strong className="text-cyan-400">ILHAM-NODE-1</strong>).</li>
            <li>Di HP, klik tombol <strong>"MULAI SESI & IZINKAN TELEMETRI"</strong> dan setujui izin kamera & lokasi (hanya 1x).</li>
            <li>Kamera HP langsung tayang di Command Center Laptop secara <em>WebRTC P2P Direct Stream (30 FPS HD)</em>.</li>
            <li>Anda dapat langsung menekan tombol Switch Kamera, Nyalakan Flash, dan melacak GPS di peta Leaflet!</li>
          </ol>
        </div>

        {/* Section 3: Fitur Kontrol Hardware */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2 font-heading">
            <Zap className="w-4 h-4 text-amber-400" />
            3. Fitur Kontrol Jarak Jauh
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-[#060a14] border border-cyan-950 rounded">
              <strong className="text-cyan-300 block mb-1">Switch Kamera Real-time</strong>
              <p className="text-[11px] text-slate-400">
                Admin dapat beralih antara Kamera Belakang (environment) dan Kamera Depan (user) secara instan via instruksi Web API.
              </p>
            </div>
            <div className="p-2.5 bg-[#060a14] border border-cyan-950 rounded">
              <strong className="text-amber-300 block mb-1">Lampu Flash / Torch</strong>
              <p className="text-[11px] text-slate-400">
                Nyalakan lampu flash hardware HP sasaran. Jika kamera depan aktif, sistem otomatis menyalakan Screen Torch (layar putih terang).
              </p>
            </div>
            <div className="p-2.5 bg-[#060a14] border border-cyan-950 rounded">
              <strong className="text-emerald-300 block mb-1">Live GPS Tracking (Leaflet)</strong>
              <p className="text-[11px] text-slate-400">
                Peta dark-radar Leaflet dengan jejak lintasan (breadcrumbs) dan akurasi meter presisi tinggi secara real-time.
              </p>
            </div>
            <div className="p-2.5 bg-[#060a14] border border-cyan-950 rounded">
              <strong className="text-rose-300 block mb-1">Audio Beacon Alert</strong>
              <p className="text-[11px] text-slate-400">
                Membunyikan chirp alarm taktis dan mengaktifkan getaran (vibration) pada perangkat sasaran dari jarak jauh.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-cyan-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-slate-950 font-bold rounded"
          >
            Mengerti & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
