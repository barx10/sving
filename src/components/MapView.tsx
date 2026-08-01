import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { MountainPassStatus, PassStatus, WeatherCheckpoint, Waypoint } from '../types';
import { hasCoords } from '../utils/geo';
import { AlertTriangle, CheckCircle2, CloudSun, HelpCircle, MousePointerClick } from 'lucide-react';

interface MapViewProps {
  polyline: [number, number][];
  waypoints: Waypoint[];
  weather?: WeatherCheckpoint[];
  passes?: MountainPassStatus[];
  /** Owned by the mountain pass panel, so list and map never disagree. */
  showPasses?: boolean;
  focusedPassId?: string | null;
  onFocusPass?: (id: string | null) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

/**
 * Leaflet's divIcon takes a raw HTML string, so anything interpolated into it
 * must be escaped. Waypoint names come from Nominatim and from shared route
 * links, and a shared link is attacker-controlled: without this, sending someone
 * a crafted "route" would run script in their browser.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

const createWaypointIcon = (color: string, label: string) =>
  L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="background-color:${color};color:${color === '#A7C957' ? '#2D332A' : '#ffffff'};font-weight:800;font-size:11px;font-family:'Plus Jakarta Sans',sans-serif;padding:4px 8px;border-radius:9999px;border:2px solid #ffffff;box-shadow:0 4px 12px rgba(45,51,42,0.3);display:inline-flex;align-items:center;white-space:nowrap;">${escapeHtml(label)}</div>`,
    iconSize: [40, 24],
    iconAnchor: [20, 12],
  });

const createWeatherIcon = (temp: number | null) =>
  L.divIcon({
    className: 'weather-leaflet-marker',
    html: `<div style="background-color:#2D332A;color:#F4F4EF;border:1px solid #A7C957;padding:3px 6px;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;"><span style="color:#A7C957;">🌤️</span><span>${temp === null ? '–' : `${Math.round(temp)}°C`}</span></div>`,
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });

const PASS_MARKER: Record<PassStatus, { bg: string; glyph: string }> = {
  open: { bg: '#386641', glyph: '🟢' },
  uncertain: { bg: '#B45309', glyph: '❓' },
  closed_seasonal: { bg: '#BC4749', glyph: '⛔' },
};

/**
 * The picked pass gets a name label and a ring so it stands out among the
 * dozen-odd others — otherwise clicking a row in the list moves the map to a
 * marker the rider cannot tell apart from its neighbours. The label overflows
 * the icon box to the right on purpose, keeping the glyph over the summit.
 */
const createPassIcon = (status: PassStatus, isFocused: boolean, name: string) => {
  const { bg, glyph } = PASS_MARKER[status];
  const shadow = isFocused
    ? 'box-shadow:0 0 0 3px rgba(167,201,87,0.9),0 6px 16px rgba(0,0,0,0.35);'
    : 'box-shadow:0 4px 10px rgba(0,0,0,0.3);';
  const label = isFocused
    ? `<span style="font-family:'Plus Jakarta Sans',sans-serif;letter-spacing:0.01em;">${escapeHtml(name)}</span>`
    : '';

  return L.divIcon({
    className: 'hazard-leaflet-marker',
    html: `<div style="background-color:${bg};color:#ffffff;padding:4px 6px;border-radius:8px;${shadow}display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;white-space:nowrap;">${glyph}${label}</div>`,
    iconSize: [32, 24],
    iconAnchor: [16, 12],
  });
};

const MapClickHandler: React.FC<{ onMapClick?: (lat: number, lng: number) => void }> = ({ onMapClick }) => {
  useMapEvents({
    click(event) {
      onMapClick?.(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
};

const FitBoundsHandler: React.FC<{ polyline: [number, number][]; waypoints: Waypoint[] }> = ({
  polyline,
  waypoints,
}) => {
  const map = useMap();

  useEffect(() => {
    const placed = waypoints.filter(hasCoords);

    if (polyline.length > 0) {
      map.fitBounds(L.latLngBounds(polyline), { padding: [50, 50] });
    } else if (placed.length >= 2) {
      map.fitBounds(L.latLngBounds(placed.map((w) => [w.lat, w.lng])), { padding: [60, 60] });
    } else if (placed.length === 1) {
      map.setView([placed[0].lat, placed[0].lng], 9);
    }
  }, [polyline, waypoints, map]);

  return null;
};

const FLY_DURATION_S = 0.8;

/**
 * Moves the map to the pass the rider just picked in the list, then opens its
 * popup. The popup waits for the flight to land: opening it up front means its
 * auto-pan and the flight fight over the centre, and the card ends up half off
 * the top of the map.
 */
const PassFocusHandler: React.FC<{
  pass: MountainPassStatus | null;
  markers: React.RefObject<Record<string, L.Marker | null>>;
}> = ({ pass, markers }) => {
  const map = useMap();

  useEffect(() => {
    if (!pass) return;

    map.flyTo([pass.lat, pass.lng], Math.max(map.getZoom(), 10), { duration: FLY_DURATION_S });

    const timer = setTimeout(() => markers.current[pass.id]?.openPopup(), FLY_DURATION_S * 1000 + 60);
    return () => clearTimeout(timer);
  }, [pass, map, markers]);

  return null;
};

const ToggleButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
  activeClass: string;
  children: React.ReactNode;
}> = ({ active, onClick, title, activeClass, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`px-2 py-1 font-semibold rounded-lg border transition flex items-center gap-1 ${
      active ? activeClass : 'bg-white text-[#6B705C] border-[#E0E0D6] opacity-75'
    }`}
  >
    {children}
  </button>
);

export const MapView: React.FC<MapViewProps> = ({
  polyline,
  waypoints,
  weather = [],
  passes = [],
  showPasses = false,
  focusedPassId = null,
  onFocusPass,
  onMapClick,
}) => {
  const [mapTile, setMapTile] = useState<'voyager' | 'kartverket_topo'>('voyager');
  const [showWeather, setShowWeather] = useState(false);

  const passMarkerRefs = useRef<Record<string, L.Marker | null>>({});
  const placedWaypoints = waypoints.filter(hasCoords);
  const focusedPass = (showPasses && passes.find((p) => p.id === focusedPassId)) || null;

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-2xl overflow-hidden border border-[#E0E0D6] shadow-md bg-[#E5E9EC]">
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-[#2D332A]/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/20 shadow-md backdrop-blur-md">
        <MousePointerClick className="w-4 h-4 text-[#A7C957]" />
        <span className="hidden sm:inline">Klikk i kartet for å sette punkter</span>
        <span className="sm:hidden">Klikk i kart</span>
      </div>

      <div className="absolute top-3 right-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#E0E0D6] shadow-md text-xs">
        <div className="flex items-center gap-1 bg-[#F9F9F7] p-0.5 rounded-lg border border-[#E0E0D6]">
          {([['voyager', 'Naturkart'], ['kartverket_topo', 'Norgeskart']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMapTile(id)}
              aria-pressed={mapTile === id}
              className={`px-2 py-0.5 text-xs font-bold rounded-md transition ${
                mapTile === id ? 'bg-[#A7C957] text-[#2D332A] shadow-sm' : 'text-[#6B705C] hover:text-[#2D332A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[#E0E0D6] mx-0.5" />

        <ToggleButton
          active={showWeather}
          onClick={() => setShowWeather((prev) => !prev)}
          title="Vis eller skjul værvarsel langs ruten"
          activeClass="bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]"
        >
          <CloudSun className="w-3.5 h-3.5" />
          <span>Vær</span>
        </ToggleButton>
      </div>

      <MapContainer
        center={[61.8, 8.5]}
        zoom={6}
        scrollWheelZoom
        style={{ width: '100%', height: '100%' }}
        className="z-0 cursor-crosshair"
      >
        {mapTile === 'voyager' ? (
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
          />
        )}

        <MapClickHandler onMapClick={onMapClick} />
        <FitBoundsHandler polyline={polyline} waypoints={waypoints} />
        <PassFocusHandler pass={focusedPass} markers={passMarkerRefs} />

        {polyline.length > 0 && (
          <>
            <Polyline
              positions={polyline}
              pathOptions={{ color: '#386641', weight: 8, opacity: 0.35, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={polyline}
              pathOptions={{ color: '#A7C957', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
          </>
        )}

        {placedWaypoints.map((wp, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === placedWaypoints.length - 1 && placedWaypoints.length > 1;
          const color = isStart ? '#A7C957' : isEnd ? '#BC4749' : '#386641';
          const prefix = isStart ? 'START' : isEnd ? 'MÅL' : `VIA ${idx}`;

          return (
            <Marker
              key={wp.id}
              position={[wp.lat, wp.lng]}
              icon={createWaypointIcon(color, `${prefix}: ${wp.name || 'Kartpunkt'}`)}
            >
              <Popup>
                <div className="p-1">
                  <h4 className="font-bold text-sm">{wp.name || 'Kartpunkt'}</h4>
                  <p className="text-xs text-[#6B705C]">
                    {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {showWeather &&
          polyline.length > 0 &&
          weather.map((checkpoint, idx) => (
            <Marker
              key={`wx_${idx}`}
              position={[checkpoint.lat, checkpoint.lng]}
              icon={createWeatherIcon(checkpoint.forecast?.tempC ?? null)}
            >
              <Popup>
                <div className="p-1">
                  <div className="flex items-center gap-1 font-bold text-sm">
                    <CloudSun className="w-4 h-4 text-sky-500" />
                    <span>{checkpoint.locationName}</span>
                  </div>
                  {checkpoint.forecast ? (
                    <div className="mt-1 text-xs space-y-0.5">
                      <p>Temperatur: <strong>{checkpoint.forecast.tempC ?? '–'} °C</strong></p>
                      <p>Vind: <strong>{checkpoint.forecast.windSpeedMs ?? '–'} m/s</strong></p>
                      <p>Nedbør: <strong>{checkpoint.forecast.precipitationMm ?? '–'} mm</strong></p>
                      <p className="text-[10px] text-slate-400 mt-1">Kilde: MET.no</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs">{checkpoint.error || 'Vær ikke tilgjengelig'}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

        {showPasses &&
          passes.map((pass) => (
            <Marker
              key={pass.id}
              position={[pass.lat, pass.lng]}
              icon={createPassIcon(pass.status, pass.id === focusedPassId, pass.name)}
              zIndexOffset={pass.id === focusedPassId ? 1000 : 0}
              ref={(instance) => {
                passMarkerRefs.current[pass.id] = instance;
              }}
              eventHandlers={{ click: () => onFocusPass?.(pass.id) }}
            >
              {/* The extra top padding keeps the card clear of the map's own
                  control bar, which floats above the Leaflet panes. */}
              <Popup
                autoPanPaddingTopLeft={[24, 58]}
                autoPanPaddingBottomRight={[24, 24]}
                maxWidth={260}
              >
                <div className="p-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    {pass.status === 'closed_seasonal' ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                    ) : pass.status === 'uncertain' ? (
                      <HelpCircle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    <span>{pass.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {pass.road}
                    {pass.summitM ? ` · ${pass.summitM} moh` : ''}
                  </p>
                  <p className="mt-1 text-xs">{pass.description}</p>
                  <p className="mt-1.5 text-[11px] font-bold">{pass.statusLabel}</p>
                  <p className="text-[11px] text-slate-600">{pass.statusDetail}</p>
                  {pass.note && <p className="mt-1 text-[11px] text-amber-700">{pass.note}</p>}
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
};
