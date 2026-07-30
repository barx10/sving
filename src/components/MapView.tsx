import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Waypoint, WeatherPoint, RoadHazard } from '../types';
import { Map, Layers, CloudSun, AlertTriangle, CheckCircle2, MousePointerClick } from 'lucide-react';

interface MapViewProps {
  polyline: [number, number][]; // [lat, lng]
  waypoints: Waypoint[];
  weatherPoints?: WeatherPoint[];
  hazards?: RoadHazard[];
  onWaypointClick?: (wp: Waypoint) => void;
  onMapClick?: (lat: number, lng: number) => void;
}

// Custom Leaflet Markers with Inline SVG
const createCustomIcon = (color: string, label: string) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${color};
        color: ${color === '#A7C957' ? '#2D332A' : '#ffffff'};
        font-weight: 800;
        font-size: 11px;
        font-family: 'Plus Jakarta Sans', sans-serif;
        padding: 4px 8px;
        border-radius: 9999px;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(45,51,42,0.3);
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
      ">
        ${label}
      </div>
    `,
    iconSize: [40, 24],
    iconAnchor: [20, 12],
  });
};

const createWeatherIcon = (temp: number, symbolCode: string) => {
  return L.divIcon({
    className: 'weather-leaflet-marker',
    html: `
      <div style="
        background-color: #2D332A;
        color: #F4F4EF;
        border: 1px solid #A7C957;
        padding: 3px 6px;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'JetBrains Mono', monospace;
      ">
        <span style="color: #A7C957;">🌤️</span>
        <span>${temp}°C</span>
      </div>
    `,
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });
};

const createHazardIcon = (status: 'closed' | 'open' | 'restricted' | 'warning') => {
  const isClosed = status === 'closed';
  const bg = isClosed ? '#BC4749' : '#386641';
  const icon = isClosed ? '⛔' : '🟢';

  return L.divIcon({
    className: 'hazard-leaflet-marker',
    html: `
      <div style="
        background-color: ${bg};
        color: #ffffff;
        padding: 4px 6px;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 800;
      ">
        <span>${icon}</span>
      </div>
    `,
    iconSize: [32, 24],
    iconAnchor: [16, 12],
  });
};

// Component to handle map clicks for placing waypoints
const MapClickHandler: React.FC<{ onMapClick?: (lat: number, lng: number) => void }> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

// Component to dynamically fit map bounds to route or waypoints
const FitBoundsHandler: React.FC<{ polyline: [number, number][]; waypoints: Waypoint[] }> = ({
  polyline,
  waypoints,
}) => {
  const map = useMap();

  useEffect(() => {
    const validWaypoints = waypoints.filter((w) => w.lat !== 0 || w.lng !== 0);

    if (polyline && polyline.length > 0) {
      const bounds = L.latLngBounds(polyline);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (validWaypoints.length >= 2) {
      const bounds = L.latLngBounds(validWaypoints.map((w) => [w.lat, w.lng]));
      map.fitBounds(bounds, { padding: [60, 60] });
    } else if (validWaypoints.length === 1) {
      map.setView([validWaypoints[0].lat, validWaypoints[0].lng], 9);
    }
  }, [polyline, waypoints, map]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({
  polyline,
  waypoints,
  weatherPoints = [],
  hazards = [],
  onMapClick,
}) => {
  const [mapTile, setMapTile] = useState<'osm_dark' | 'kartverket_topo'>('osm_dark');
  const [showWeather, setShowWeather] = useState<boolean>(false);
  const [showHazards, setShowHazards] = useState<boolean>(false);

  // Center of Norway (approx Gudbrandsdalen / Jotunheimen)
  const defaultCenter: [number, number] = [61.8, 8.5];

  // Only render markers for waypoints that have valid coordinates
  const validWaypoints = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);

  return (
    <div id="map-container" className="relative w-full h-full min-h-[380px] rounded-2xl overflow-hidden border border-[#E0E0D6] shadow-md bg-[#E5E9EC]">
      {/* Click Map Hint Banner */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 bg-[#2D332A]/90 text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/20 shadow-md backdrop-blur-md">
        <MousePointerClick className="w-4 h-4 text-[#A7C957] animate-pulse" />
        <span className="hidden sm:inline">Klikk på kartet for å velge punkter</span>
        <span className="sm:hidden">Klikk i kart</span>
      </div>

      {/* Map Control Bar (Tile & Overlay Toggles) */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-[#E0E0D6] shadow-md text-xs">
        {/* Map Type Tiles */}
        <div className="flex items-center gap-1 bg-[#F9F9F7] p-0.5 rounded-lg border border-[#E0E0D6]">
          <button
            type="button"
            onClick={() => setMapTile('osm_dark')}
            className={`px-2 py-0.5 text-xs font-bold rounded-md transition ${
              mapTile === 'osm_dark'
                ? 'bg-[#A7C957] text-[#2D332A] shadow-sm'
                : 'text-[#6B705C] hover:text-[#2D332A]'
            }`}
          >
            Naturkart
          </button>
          <button
            type="button"
            onClick={() => setMapTile('kartverket_topo')}
            className={`px-2 py-0.5 text-xs font-bold rounded-md transition ${
              mapTile === 'kartverket_topo'
                ? 'bg-[#A7C957] text-[#2D332A] shadow-sm'
                : 'text-[#6B705C] hover:text-[#2D332A]'
            }`}
          >
            Norgeskart Topo
          </button>
        </div>

        <div className="w-[1px] h-4 bg-[#E0E0D6] mx-0.5" />

        {/* Weather Overlay Switch */}
        <button
          type="button"
          onClick={() => setShowWeather((prev) => !prev)}
          title="Vis/skjul værvarsel langs ruten"
          className={`px-2 py-1 font-semibold rounded-lg border transition flex items-center gap-1 ${
            showWeather
              ? 'bg-[#E9EDC9] text-[#386641] border-[#CCD5AE]'
              : 'bg-white text-[#6B705C] border-[#E0E0D6] opacity-75'
          }`}
        >
          <CloudSun className="w-3.5 h-3.5" />
          <span>Vær</span>
        </button>

        {/* Hazards Overlay Switch */}
        <button
          type="button"
          onClick={() => setShowHazards((prev) => !prev)}
          title="Vis/skjul stengte fjelloverganger og veivarsler"
          className={`px-2 py-1 font-semibold rounded-lg border transition flex items-center gap-1 ${
            showHazards
              ? 'bg-amber-50 text-amber-900 border-amber-200'
              : 'bg-white text-[#6B705C] border-[#E0E0D6] opacity-75'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Fjelloverganger</span>
        </button>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={6}
        scrollWheelZoom={true}
        style={{ width: '100%', height: '100%' }}
        className="z-0 cursor-crosshair"
      >
        {/* Tile Layers */}
        {mapTile === 'osm_dark' ? (
          <TileLayer
            attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://openstreetmap.org">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
          />
        )}

        {/* Map Click Listener */}
        <MapClickHandler onMapClick={onMapClick} />

        {/* Fit Bounds Controller */}
        <FitBoundsHandler polyline={polyline} waypoints={waypoints} />

        {/* Main Route Polyline */}
        {polyline && polyline.length > 0 && (
          <>
            {/* Outer Glow Line */}
            <Polyline
              positions={polyline}
              pathOptions={{
                color: '#386641',
                weight: 8,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            {/* Core Bright Line */}
            <Polyline
              positions={polyline}
              pathOptions={{
                color: '#A7C957',
                weight: 5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Waypoint Markers */}
        {validWaypoints.map((wp, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === validWaypoints.length - 1 && validWaypoints.length > 1;
          const color = isStart ? '#A7C957' : isEnd ? '#BC4749' : '#386641';
          const label = isStart ? '🏁 START' : isEnd ? '🏆 MÅL' : `VIA ${idx}`;

          return (
            <Marker
              key={wp.id || idx}
              position={[wp.lat, wp.lng]}
              icon={createCustomIcon(color, `${label}: ${wp.name || 'Kartpunkt'}`)}
            >
              <Popup className="custom-popup">
                <div className="p-1 text-[#2D332A]">
                  <h4 className="font-bold text-sm">{wp.name || 'Kartpunkt'}</h4>
                  <p className="text-xs text-[#6B705C]">
                    Pos: {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Weather Markers Along Route (Only when toggled ON and route exists) */}
        {showWeather && polyline && polyline.length > 0 && weatherPoints.map((wp, idx) => (
          <Marker
            key={`wx_${idx}`}
            position={[wp.lat, wp.lng]}
            icon={createWeatherIcon(wp.temp, wp.symbolCode)}
          >
            <Popup>
              <div className="p-1 text-slate-900">
                <div className="flex items-center gap-1 font-bold text-sm">
                  <CloudSun className="w-4 h-4 text-sky-500" />
                  <span>{wp.locationName}</span>
                </div>
                <div className="mt-1 text-xs space-y-0.5 text-slate-700">
                  <p>Temperatur: <strong>{wp.temp}°C</strong></p>
                  <p>Vind: <strong>{wp.windSpeed} m/s</strong></p>
                  <p>Nedbør: <strong>{wp.precipitation} mm</strong></p>
                  <p className="text-[10px] text-slate-400 mt-1">Kilde: MET.no WeatherAPI</p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Mountain Pass Hazard Markers (Only when toggled ON) */}
        {showHazards && hazards.map((hz) => (
          <Marker
            key={hz.id}
            position={[hz.lat, hz.lng]}
            icon={createHazardIcon(hz.status)}
          >
            <Popup>
              <div className="p-1 text-slate-900">
                <div className="flex items-center gap-1.5 font-bold text-sm">
                  {hz.status === 'closed' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  <span>{hz.name}</span>
                </div>
                <p className="mt-1 text-xs text-slate-700">{hz.description}</p>
                <div className="mt-2 text-[11px] font-bold">
                  Status:{' '}
                  <span className={hz.status === 'closed' ? 'text-rose-600' : 'text-emerald-600'}>
                    {hz.status === 'closed' ? 'VINTERSTENGT / STENGT' : 'ÅPEN FOR TRAFIKK'}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
