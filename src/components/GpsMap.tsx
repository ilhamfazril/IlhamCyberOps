import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { GpsCoordinates } from '../types.ts';
import { Crosshair, Navigation, Maximize2, Layers } from 'lucide-react';

interface GpsMapProps {
  gps?: GpsCoordinates;
  breadcrumbs?: Array<{ lat: number; lng: number }>;
  nodeName?: string;
  className?: string;
}

export const GpsMap: React.FC<GpsMapProps> = ({ gps, breadcrumbs = [], nodeName, className = '' }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default coordinate (Jakarta, Indonesia or fallback)
    const initialLat = gps?.lat ?? -6.2088;
    const initialLng = gps?.lng ?? 106.8456;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: false,
    });

    // Dark Matter CartoDB tiles for Cyberpunk tactical aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    // Custom Neon Radar Marker Icon
    const radarIcon = L.divIcon({
      className: 'custom-radar-icon',
      html: `
        <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 36px; height: 36px; border-radius: 9999px; background: rgba(6, 182, 212, 0.25); animation: cyber-radar 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; width: 20px; height: 20px; border-radius: 9999px; border: 2px solid #22d3ee; background: rgba(8, 51, 68, 0.85); box-shadow: 0 0 12px #06b6d4;"></div>
          <div style="width: 6px; height: 6px; border-radius: 9999px; background: #67e8f9;"></div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const marker = L.marker([initialLat, initialLng], { icon: radarIcon }).addTo(map);
    markerRef.current = marker;

    const circle = L.circle([initialLat, initialLng], {
      radius: gps?.accuracy || 20,
      color: '#06b6d4',
      weight: 1,
      fillColor: '#0891b2',
      fillOpacity: 0.12,
    }).addTo(map);
    circleRef.current = circle;

    // Tactical path breadcrumbs
    const polyline = L.polyline([], {
      color: '#22d3ee',
      weight: 3,
      opacity: 0.7,
      dashArray: '4, 8',
    }).addTo(map);
    polylineRef.current = polyline;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update position on gps change
  useEffect(() => {
    if (!mapInstanceRef.current || !gps) return;

    const { lat, lng, accuracy } = gps;
    const latLng = L.latLng(lat, lng);

    if (markerRef.current) {
      markerRef.current.setLatLng(latLng);
      markerRef.current.bindPopup(`
        <div style="padding: 4px; font-family: monospace; font-size: 11px;">
          <strong style="color: #22d3ee; display: block; margin-bottom: 2px;">${nodeName || 'TARGET NODE'}</strong>
          <span>LAT: ${lat.toFixed(5)}</span><br/>
          <span>LNG: ${lng.toFixed(5)}</span><br/>
          <span>ACC: ±${Math.round(accuracy || 0)}m</span>
        </div>
      `);
    }

    if (circleRef.current) {
      circleRef.current.setLatLng(latLng);
      if (accuracy) circleRef.current.setRadius(accuracy);
    }

    // Auto pan gently
    mapInstanceRef.current.panTo(latLng, { animate: true, duration: 0.8 });
  }, [gps?.lat, gps?.lng, gps?.accuracy, nodeName]);

  // Update breadcrumbs track
  useEffect(() => {
    if (!polylineRef.current) return;
    const latLngs = breadcrumbs.map((b) => [b.lat, b.lng] as [number, number]);
    polylineRef.current.setLatLngs(latLngs);
  }, [breadcrumbs]);

  const handleCenter = () => {
    if (mapInstanceRef.current && gps) {
      mapInstanceRef.current.setView([gps.lat, gps.lng], 17, { animate: true });
    }
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  return (
    <div className={`relative w-full h-full min-h-[300px] bg-[#07090e] border border-cyan-900/40 rounded-lg overflow-hidden flex flex-col ${className}`}>
      {/* Top Map HUD overlay */}
      <div className="absolute top-2 left-2 z-[400] flex items-center gap-2 bg-[#090d16]/90 backdrop-blur-md px-3 py-1.5 rounded border border-cyan-500/30 text-xs">
        <Navigation className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
        <span className="text-cyan-400 font-semibold tracking-wider">GPS RADAR TACTICAL</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-300 font-mono">
          {gps ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'SIGNAL ACQUIRING...'}
        </span>
      </div>

      {/* Floating Map Controls */}
      <div className="absolute top-2 right-2 z-[400] flex flex-col gap-1.5">
        <button
          onClick={handleCenter}
          title="Center on Target"
          className="p-2 bg-[#0a101d]/90 hover:bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 rounded transition-colors shadow-lg active:scale-95"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-2 bg-[#0a101d]/90 hover:bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 rounded transition-colors shadow-lg active:scale-95"
        >
          <span className="font-bold text-sm leading-none">+</span>
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-2 bg-[#0a101d]/90 hover:bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 rounded transition-colors shadow-lg active:scale-95"
        >
          <span className="font-bold text-sm leading-none">−</span>
        </button>
      </div>

      {/* Map Canvas Div */}
      <div ref={mapContainerRef} className="w-full h-full flex-1 z-0" />

      {/* Bottom Map Status Bar */}
      <div className="px-3 py-1.5 bg-[#080d18] border-t border-cyan-950/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-3">
          <span>AKURASI: <strong className="text-cyan-400">{gps?.accuracy ? `±${Math.round(gps.accuracy)}m` : 'N/A'}</strong></span>
          <span>KECEPATAN: <strong className="text-emerald-400">{gps?.speed ? `${(gps.speed * 3.6).toFixed(1)} km/h` : '0 km/h'}</strong></span>
          <span>KETINGGIAN: <strong className="text-slate-300">{gps?.altitude ? `${Math.round(gps.altitude)}m` : 'N/A'}</strong></span>
        </div>
        <div className="text-[10px] text-cyan-600 tracking-wider">
          CARTO DARK RADAR
        </div>
      </div>
    </div>
  );
};
