import React, { useState, useEffect, useRef } from 'react';
import type { Waypoint, RouteProfile } from '../types';
import { MapPin, Plus, Trash2, ArrowUpDown, Navigation, Flame, Mountain, Zap, Loader2, Compass, ShieldAlert, RotateCcw, Sparkles, Repeat } from 'lucide-react';

interface RouteEditorProps {
  waypoints: Waypoint[];
  setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  profile: RouteProfile;
  setProfile: (p: RouteProfile) => void;
  avoidHighways: boolean;
  setAvoidHighways: (avoid: boolean) => void;
  onCalculateRoute: () => void;
  onClearWaypoints: () => void;
  onMakeRoundTrip: () => void;
  onSuggestNearby: () => void;
  isSuggestingLocation?: boolean;
  isLoading: boolean;
}

interface GeocodeResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export const RouteEditor: React.FC<RouteEditorProps> = ({
  waypoints,
  setWaypoints,
  profile,
  setProfile,
  avoidHighways,
  setAvoidHighways,
  onCalculateRoute,
  onClearWaypoints,
  onMakeRoundTrip,
  onSuggestNearby,
  isSuggestingLocation = false,
  isLoading,
}) => {
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Address geocoding search in Norway using Nominatim OSM
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2 || activeSearchIdx === null) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setIsGeocoding(true);
      try {
        const query = encodeURIComponent(searchQuery.trim() + ', Norge');
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&countrycodes=no&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.warn('Geocoding search failed:', err);
      } finally {
        setIsGeocoding(false);
      }
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, activeSearchIdx]);

  const handleSelectPlace = (idx: number, result: GeocodeResult) => {
    const cleanName = result.display_name.split(',')[0] || result.display_name;
    const newWaypoints = [...waypoints];
    newWaypoints[idx] = {
      ...newWaypoints[idx],
      name: cleanName,
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      isCustom: true,
    };
    setWaypoints(newWaypoints);
    setActiveSearchIdx(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleAddViaPoint = () => {
    const newWp: Waypoint = {
      id: `via_${Date.now()}`,
      name: 'Via-punkt',
      lat: (waypoints[0].lat + waypoints[waypoints.length - 1].lat) / 2,
      lng: (waypoints[0].lng + waypoints[waypoints.length - 1].lng) / 2,
    };
    const updated = [...waypoints];
    updated.splice(updated.length - 1, 0, newWp); // Insert before destination
    setWaypoints(updated);
  };

  const handleRemoveViaPoint = (index: number) => {
    if (waypoints.length <= 2) return;
    const updated = waypoints.filter((_, i) => i !== index);
    setWaypoints(updated);
  };

  const handleMoveViaPoint = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= waypoints.length) return;
    const updated = [...waypoints];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setWaypoints(updated);
  };

  const handleUseCurrentLocation = (index: number) => {
    if (!navigator.geolocation) {
      alert('Geolokasjon støttes ikke i denne nettleseren.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const updated = [...waypoints];
        updated[index] = {
          ...updated[index],
          name: 'Min Posisjon 📍',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setWaypoints(updated);
      },
      (err) => {
        alert('Kunne ikke hente posisjon: ' + err.message);
      }
    );
  };

  return (
    <div id="route-editor-panel" className="bg-white border border-[#E0E0D6] rounded-2xl p-5 shadow-sm flex flex-col gap-4 text-[#2D332A]">
      <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#386641]" />
          <h2 className="text-base font-bold text-[#2D332A]">Ruteplanlegger</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClearWaypoints}
            title="Nullstill og tøm alle punkter"
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F9F9F7] text-[#6B705C] hover:text-[#BC4749] hover:bg-rose-50 border border-[#E0E0D6] transition flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Tøm rute
          </button>
        </div>
      </div>

      {/* Location Suggestion Action Banner */}
      <button
        type="button"
        onClick={onSuggestNearby}
        disabled={isSuggestingLocation}
        className="w-full py-2.5 px-3 rounded-xl bg-[#E9EDC9] hover:bg-[#386641] hover:text-white text-[#5C6B34] text-xs font-bold border border-[#CCD5AE] transition flex items-center justify-center gap-2 shadow-sm group"
      >
        {isSuggestingLocation ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Finner din posisjon...</span>
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4 text-[#386641] group-hover:text-white transition" />
            <span>📍 Foreslå MC-rute nær meg</span>
          </>
        )}
      </button>

      {/* Profile Selector */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Rutepreferanse</label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setProfile('curvy')}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition ${
              profile === 'curvy'
                ? 'bg-[#E9EDC9] border-[#CCD5AE] text-[#5C6B34] shadow-sm'
                : 'bg-[#F9F9F7] border-[#E0E0D6] text-[#6B705C] hover:border-[#A7C957]'
            }`}
          >
            <Flame className="w-4 h-4 mb-1 text-[#386641]" />
            <span>Svingete Veier</span>
          </button>

          <button
            type="button"
            onClick={() => setProfile('scenic')}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition ${
              profile === 'scenic'
                ? 'bg-[#E9EDC9] border-[#CCD5AE] text-[#5C6B34] shadow-sm'
                : 'bg-[#F9F9F7] border-[#E0E0D6] text-[#6B705C] hover:border-[#A7C957]'
            }`}
          >
            <Mountain className="w-4 h-4 mb-1 text-[#5C6B34]" />
            <span>Naturskjønn</span>
          </button>

          <button
            type="button"
            onClick={() => setProfile('fastest')}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition ${
              profile === 'fastest'
                ? 'bg-[#E0E0D6] border-[#6B705C] text-[#2D332A] shadow-sm'
                : 'bg-[#F9F9F7] border-[#E0E0D6] text-[#6B705C] hover:border-[#A7C957]'
            }`}
          >
            <Zap className="w-4 h-4 mb-1 text-[#2D332A]" />
            <span>Raskeste</span>
          </button>
        </div>

        {/* Avoid Motorways Toggle */}
        <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-xl bg-[#F9F9F7] border border-[#E0E0D6]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#386641]" />
            <span className="text-xs font-bold text-[#2D332A]">Unngå motorvei (E-veier)</span>
          </div>
          <button
            type="button"
            onClick={() => setAvoidHighways(!avoidHighways)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              avoidHighways ? 'bg-[#386641]' : 'bg-[#E0E0D6]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                avoidHighways ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Waypoints Input List */}
      <div className="space-y-2.5">
        <label className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Rutepunkter i Norge</label>
        {waypoints.map((wp, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === waypoints.length - 1;
          const isSearching = activeSearchIdx === idx;

          return (
            <div key={wp.id || idx} className="relative group">
              <div className="flex items-center gap-2 bg-[#F9F9F7] border border-[#E0E0D6] focus-within:border-[#A7C957] focus-within:ring-1 focus-within:ring-[#A7C957] rounded-xl p-2 transition">
                {/* Point type indicator pin */}
                <div className="pl-1">
                  {isStart ? (
                    <div className="w-6 h-6 rounded-full bg-[#A7C957] text-[#2D332A] flex items-center justify-center text-xs font-extrabold shadow-sm">
                      A
                    </div>
                  ) : isEnd ? (
                    <div className="w-6 h-6 rounded-full bg-[#BC4749] text-white flex items-center justify-center text-xs font-extrabold shadow-sm">
                      B
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#E0E0D6] text-[#2D332A] flex items-center justify-center text-xs font-bold">
                      {idx}
                    </div>
                  )}
                </div>

                {/* Place Name / Input Search */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={isSearching ? searchQuery : wp.name}
                    onChange={(e) => {
                      setActiveSearchIdx(idx);
                      setSearchQuery(e.target.value);
                    }}
                    onFocus={() => {
                      setActiveSearchIdx(idx);
                      setSearchQuery(wp.name);
                    }}
                    placeholder={isStart ? 'Søk startsted (f.eks. Åndalsnes)' : isEnd ? 'Søk sluttsted (f.eks. Geiranger)' : 'Via-punkt'}
                    className="w-full bg-transparent text-sm text-[#2D332A] placeholder-[#6B705C] focus:outline-none font-medium truncate"
                  />
                </div>

                {/* Actions: Current Location / Reorder / Delete */}
                <div className="flex items-center gap-1">
                  {isStart && (
                    <button
                      type="button"
                      title="Bruk min posisjon"
                      onClick={() => handleUseCurrentLocation(idx)}
                      className="p-1.5 rounded-lg text-[#6B705C] hover:text-[#386641] hover:bg-[#E9EDC9] transition"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!isStart && !isEnd && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMoveViaPoint(idx, idx - 1)}
                        disabled={idx <= 1}
                        className="p-1 text-[#6B705C] hover:text-[#2D332A] disabled:opacity-30"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveViaPoint(idx)}
                        className="p-1.5 rounded-lg text-[#6B705C] hover:text-[#BC4749] hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Geocoding Dropdown Suggestions */}
              {isSearching && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-[#E0E0D6] rounded-xl shadow-xl max-h-56 overflow-y-auto">
                  {isGeocoding ? (
                    <div className="p-3 text-xs text-[#6B705C] flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#386641]" /> Søker i stedsnavn...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((res) => (
                      <button
                        key={res.place_id}
                        type="button"
                        onClick={() => handleSelectPlace(idx, res)}
                        className="w-full text-left px-3.5 py-2.5 text-xs text-[#2D332A] hover:bg-[#E9EDC9] border-b border-[#E0E0D6] last:border-none flex items-start gap-2 transition"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#386641] shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{res.display_name}</span>
                      </button>
                    ))
                  ) : searchQuery.length >= 2 ? (
                    <div className="p-3 text-xs text-[#6B705C] text-center">Ingen treff funnet i Norge.</div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Via Point & Round Trip Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {waypoints.length < 8 && (
          <button
            type="button"
            onClick={handleAddViaPoint}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] text-[#2D332A] text-xs font-bold border border-[#E0E0D6] transition"
          >
            <Plus className="w-3.5 h-3.5 text-[#386641]" /> Legg til via-punkt
          </button>
        )}
        <button
          type="button"
          onClick={onMakeRoundTrip}
          title="Gjør om til rundtur slik at ruten slutter samme sted som den startet"
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#E9EDC9] hover:bg-[#386641] hover:text-white text-[#5C6B34] text-xs font-bold border border-[#CCD5AE] transition shadow-sm group"
        >
          <Repeat className="w-3.5 h-3.5 text-[#386641] group-hover:text-white transition" /> Gjør til rundtur 🔄
        </button>
      </div>

      {/* Primary Calculate Button */}
      <button
        id="btn-calculate-route"
        type="button"
        onClick={onCalculateRoute}
        disabled={isLoading}
        className="w-full mt-1 py-3 px-4 rounded-xl bg-[#386641] hover:bg-[#2D332A] text-white font-extrabold text-sm shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Beregner svinger & høydemeter...</span>
          </>
        ) : (
          <>
            <Flame className="w-4 h-4" />
            <span>Beregn Rute</span>
          </>
        )}
      </button>
    </div>
  );
};
