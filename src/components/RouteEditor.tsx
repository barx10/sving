import React, { useEffect, useRef, useState } from 'react';
import type { Notice, RouteProfile, RouteSummary, Waypoint } from '../types';
import { type PlaceResult, searchPlaces } from '../api';
import { hasCoords } from '../utils/geo';
import { formatDuration } from '../utils/format';
import { GeolocationError, getRiderPosition } from '../utils/geolocation';
import {
  ArrowUpDown,
  Clock,
  Ship,
  Compass,
  Flame,
  Info,
  Loader2,
  MapPin,
  MousePointerClick,
  Navigation,
  Plus,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Zap,
} from 'lucide-react';

/** Shared with the GPX import, which thins a file down to what fits here. */
export const MAX_WAYPOINTS = 8;
const SEARCH_DEBOUNCE_MS = 350;

interface RouteEditorProps {
  waypoints: Waypoint[];
  setWaypoints: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  profile: RouteProfile;
  setProfile: (p: RouteProfile) => void;
  avoidHighways: boolean;
  setAvoidHighways: (avoid: boolean) => void;
  avoidFerries: boolean;
  setAvoidFerries: (avoid: boolean) => void;
  departureTime: string;
  setDepartureTime: (value: string) => void;
  onClearWaypoints: () => void;
  onMakeRoundTrip: () => void;
  onSuggestNearby: () => void;
  onNotify: (tone: Notice['tone'], message: string) => void;
  /** Retries the automatic calculation after it failed. */
  onRetryRoute: () => void;
  /** The route currently on the map, if any. Drives the status line. */
  summary?: RouteSummary | null;
  routeError?: string | null;
  /** From the finished route: did the riding style get anything to choose from? */
  rankedAlternatives?: boolean;
  isSuggestingLocation?: boolean;
  isLoading: boolean;
}

const PROFILES: { id: RouteProfile; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: 'curvy',
    label: 'Svingete veier',
    hint: 'Slår på motorvei-bryteren under, og velger den mest svingete av rutene motoren tilbyr.',
    icon: <Flame className="w-4 h-4 mb-1 text-[#386641]" />,
  },
  {
    id: 'fastest',
    label: 'Raskeste',
    hint: 'Korteste kjøretid. Motorvei tillates hvis du slår av bryteren under.',
    icon: <Zap className="w-4 h-4 mb-1 text-[#2D332A]" />,
  },
];

const Switch: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ icon, label, hint, checked, onChange }) => (
  <div className="mt-2.5 p-2.5 rounded-xl bg-[#F9F9F7] border border-[#E0E0D6]">
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-bold">{label}</span>
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-[#386641]' : 'bg-[#E0E0D6]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
    {hint && <p className="mt-1.5 text-[11px] text-[#6B705C] leading-relaxed">{hint}</p>}
  </div>
);

export const RouteEditor: React.FC<RouteEditorProps> = ({
  waypoints,
  setWaypoints,
  profile,
  setProfile,
  avoidHighways,
  setAvoidHighways,
  avoidFerries,
  setAvoidFerries,
  departureTime,
  setDepartureTime,
  onClearWaypoints,
  onMakeRoundTrip,
  onSuggestNearby,
  onNotify,
  onRetryRoute,
  summary = null,
  routeError = null,
  rankedAlternatives,
  isSuggestingLocation = false,
  isLoading,
}) => {
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [locatingIdx, setLocatingIdx] = useState<number | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const placed = waypoints.filter(hasCoords);
  const placedCount = placed.length;

  // Two points and no route yet means one is on its way: either in flight, or
  // waiting out the short debounce that follows the last edit.
  const isBusy = placedCount >= 2 && (isLoading || (!summary && !routeError));

  // Place search runs through our own server, which holds the identifying
  // User-Agent Nominatim asks for and caches repeat lookups.
  useEffect(() => {
    if (searchQuery.trim().length < 2 || activeSearchIdx === null) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setIsGeocoding(true);
      try {
        setSearchResults(await searchPlaces(searchQuery.trim(), controller.signal));
      } catch (err) {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          console.warn('Place search failed:', err);
        }
      } finally {
        if (!controller.signal.aborted) setIsGeocoding(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, activeSearchIdx]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const closeSearch = () => {
    setActiveSearchIdx(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSelectPlace = (index: number, result: PlaceResult) => {
    setWaypoints((prev) =>
      prev.map((wp, i) =>
        i === index ? { ...wp, name: result.name, lat: result.lat, lng: result.lng, isCustom: true } : wp
      )
    );
    closeSearch();
  };

  /**
   * Adds a via point between the existing ones. Only interpolates when both
   * ends are actually placed — the previous version averaged in the (0, 0)
   * placeholder of an empty row and dropped the via point off the coast of Africa.
   */
  const handleAddViaPoint = () => {
    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const canInterpolate = hasCoords(first) && hasCoords(last);

    const newWaypoint: Waypoint = {
      id: `via_${Date.now()}`,
      name: canInterpolate ? 'Via-punkt' : '',
      lat: canInterpolate ? (first.lat + last.lat) / 2 : 0,
      lng: canInterpolate ? (first.lng + last.lng) / 2 : 0,
    };

    const updated = [...waypoints];
    updated.splice(updated.length - 1, 0, newWaypoint);
    setWaypoints(updated);
  };

  const handleRemoveViaPoint = (index: number) => {
    if (waypoints.length <= 2) return;
    setWaypoints(waypoints.filter((_, i) => i !== index));
  };

  const handleMoveViaPoint = (fromIndex: number, toIndex: number) => {
    if (toIndex < 1 || toIndex >= waypoints.length - 1) return;
    const updated = [...waypoints];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setWaypoints(updated);
  };

  /**
   * Finding a position can take both attempts and the best part of half a
   * minute, so the button says so rather than looking dead.
   */
  const handleUseCurrentLocation = async (index: number) => {
    setLocatingIdx(index);
    try {
      const coords = await getRiderPosition();
      setWaypoints((prev) =>
        prev.map((wp, i) => (i === index ? { ...wp, name: 'Min posisjon', ...coords } : wp))
      );
    } catch (err) {
      onNotify('error', err instanceof GeolocationError ? err.message : 'Kunne ikke hente posisjonen din.');
    } finally {
      setLocatingIdx(null);
    }
  };

  return (
    <div className="bg-white border border-[#E0E0D6] rounded-2xl p-5 shadow-sm flex flex-col gap-4 text-[#2D332A]">
      <div className="flex items-center justify-between border-b border-[#E0E0D6] pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#386641]" />
          <h2 className="text-base font-bold">Ruteplanlegger</h2>
        </div>
        <button
          type="button"
          onClick={onClearWaypoints}
          className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F9F9F7] text-[#6B705C] hover:text-[#BC4749] hover:bg-rose-50 border border-[#E0E0D6] transition flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Tøm rute
        </button>
      </div>

      <button
        type="button"
        onClick={onSuggestNearby}
        disabled={isSuggestingLocation}
        className="w-full py-2.5 px-3 rounded-xl bg-[#E9EDC9] hover:bg-[#386641] hover:text-white text-[#5C6B34] text-xs font-bold border border-[#CCD5AE] transition flex items-center justify-center gap-2 shadow-sm group disabled:opacity-60"
      >
        {isSuggestingLocation ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Finner din posisjon...</span>
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4 text-[#386641] group-hover:text-white transition" />
            <span>Foreslå MC-rute nær meg</span>
          </>
        )}
      </button>

      {/* Riding style */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Rutepreferanse</span>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Rutepreferanse">
          {PROFILES.map(({ id, label, hint, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setProfile(id)}
              aria-pressed={profile === id}
              title={hint}
              className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition ${
                profile === id
                  ? 'bg-[#E9EDC9] border-[#CCD5AE] text-[#5C6B34] shadow-sm'
                  : 'bg-[#F9F9F7] border-[#E0E0D6] text-[#6B705C] hover:border-[#A7C957]'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/*
          Being straight about how little this does on a long route. The engines
          only offer alternatives to rank on a plain A-to-B request, so on
          anything else "svingete" means avoiding motorways and nothing more.
        */}
        {/*
          This notice used to predict, from the straight-line distance, that a
          via point would leave the road choice to the engine. Routing per leg
          made that prediction wrong most of the time — and it was a guess even
          when it was right. The finished route now says whether the style got
          anything to choose from, so this reports rather than forecasts.
        */}
        {profile === 'curvy' && summary && rankedAlternatives === false && (
          <p className="flex items-start gap-1.5 text-[11px] text-[#6B705C] leading-relaxed pt-0.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-px text-[#386641]" aria-hidden="true" />
            <span>
              Rutemotoren tilbød bare én vei her, så «svingete» betyr at motorvei unngås — selve
              veivalget er motorens.
            </span>
          </p>
        )}

        {/* Was "Unngå motorvei (E-veier)", which promised something no routing
            engine does: they exclude by road class, never by road name. An
            E-road built as an ordinary road stays available, and on a route
            like Oslo–Drøbak that is most of the E-road mileage. */}
        <Switch
          icon={<ShieldAlert className="w-4 h-4 text-[#386641]" />}
          label="Unngå motorvei og bomvei"
          hint="Gjelder motorvei- og bomveiklasse. En E-vei som er vanlig landevei kan fortsatt bli brukt."
          checked={avoidHighways}
          onChange={setAvoidHighways}
        />

        {/* Ferries are not a detour on Vestlandet, they are the road — so this
            stays off unless the rider says otherwise, and says what it costs. */}
        <Switch
          icon={<Ship className="w-4 h-4 text-[#386641]" />}
          label="Unngå ferger"
          hint="Ferger koster tid og penger, men uten dem blir mange ruter mye lengre — eller umulige."
          checked={avoidFerries}
          onChange={setAvoidFerries}
        />
      </div>

      {/* Departure time drives the forecast at each checkpoint */}
      <div className="space-y-1.5">
        <label
          htmlFor="departure-time"
          className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider flex items-center gap-1.5"
        >
          <Clock className="w-3 h-3" /> Avreisetidspunkt
        </label>
        <input
          id="departure-time"
          type="datetime-local"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
          className="w-full bg-[#F9F9F7] border border-[#E0E0D6] focus:border-[#A7C957] focus:ring-1 focus:ring-[#A7C957] rounded-xl px-3 py-2 text-sm font-medium focus:outline-none transition"
        />
        <p className="text-[11px] text-[#6B705C]">
          Værvarselet hentes for tidspunktet du faktisk er framme ved hvert punkt.
        </p>
      </div>

      {/* Waypoints */}
      <div className="space-y-2.5">
        <span className="text-[10px] font-bold text-[#6B705C] uppercase tracking-wider">Rutepunkter</span>
        {waypoints.map((wp, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === waypoints.length - 1;
          const isSearching = activeSearchIdx === idx;

          return (
            <div key={wp.id} className="relative">
              <div className="flex items-center gap-2 bg-[#F9F9F7] border border-[#E0E0D6] focus-within:border-[#A7C957] focus-within:ring-1 focus-within:ring-[#A7C957] rounded-xl p-2 transition">
                <span
                  aria-hidden="true"
                  className={`w-6 h-6 shrink-0 ml-1 rounded-full flex items-center justify-center text-xs font-extrabold shadow-sm ${
                    isStart
                      ? 'bg-[#A7C957] text-[#2D332A]'
                      : isEnd
                        ? 'bg-[#BC4749] text-white'
                        : 'bg-[#E0E0D6] text-[#2D332A]'
                  }`}
                >
                  {isStart ? 'A' : isEnd ? 'B' : idx}
                </span>

                <input
                  type="text"
                  value={isSearching ? searchQuery : wp.name}
                  aria-label={isStart ? 'Startsted' : isEnd ? 'Sluttsted' : `Via-punkt ${idx}`}
                  onChange={(e) => {
                    setActiveSearchIdx(idx);
                    setSearchQuery(e.target.value);
                  }}
                  onFocus={() => {
                    setActiveSearchIdx(idx);
                    setSearchQuery(wp.name);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeSearch();
                  }}
                  onBlur={() => {
                    // Delay so a click on a suggestion still registers.
                    setTimeout(() => setActiveSearchIdx((current) => (current === idx ? null : current)), 150);
                  }}
                  placeholder={
                    isStart ? 'Søk startsted (f.eks. Åndalsnes)' : isEnd ? 'Søk sluttsted (f.eks. Geiranger)' : 'Via-punkt'
                  }
                  className="flex-1 min-w-0 bg-transparent text-sm placeholder-[#6B705C] focus:outline-none font-medium truncate"
                />

                <div className="flex items-center gap-1 shrink-0">
                  {isStart && (
                    <button
                      type="button"
                      aria-label="Bruk min posisjon som startsted"
                      title="Bruk min posisjon som startsted"
                      onClick={() => handleUseCurrentLocation(idx)}
                      disabled={locatingIdx !== null}
                      className="p-1.5 rounded-lg text-[#6B705C] hover:text-[#386641] hover:bg-[#E9EDC9] transition disabled:opacity-60"
                    >
                      {locatingIdx === idx ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#386641]" />
                      ) : (
                        <Navigation className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}

                  {!isStart && !isEnd && (
                    <>
                      <button
                        type="button"
                        aria-label={`Flytt via-punkt ${idx} opp`}
                        onClick={() => handleMoveViaPoint(idx, idx - 1)}
                        disabled={idx <= 1}
                        className="p-1 text-[#6B705C] hover:text-[#2D332A] disabled:opacity-30"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Fjern via-punkt ${idx}`}
                        onClick={() => handleRemoveViaPoint(idx)}
                        className="p-1.5 rounded-lg text-[#6B705C] hover:text-[#BC4749] hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isSearching && searchQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-[#E0E0D6] rounded-xl shadow-xl max-h-56 overflow-y-auto">
                  {isGeocoding ? (
                    <div className="p-3 text-xs text-[#6B705C] flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#386641]" /> Søker i stedsnavn...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectPlace(idx, result)}
                        className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[#E9EDC9] border-b border-[#E0E0D6] last:border-none flex items-start gap-2 transition"
                      >
                        <MapPin className="w-3.5 h-3.5 text-[#386641] shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{result.displayName}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-[#6B705C] text-center">Ingen treff i Norge.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {waypoints.length < MAX_WAYPOINTS && (
          <button
            type="button"
            onClick={handleAddViaPoint}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#F9F9F7] hover:bg-[#E9EDC9] text-xs font-bold border border-[#E0E0D6] transition"
          >
            <Plus className="w-3.5 h-3.5 text-[#386641]" /> Legg til via-punkt
          </button>
        )}
        <button
          type="button"
          onClick={onMakeRoundTrip}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#E9EDC9] hover:bg-[#386641] hover:text-white text-[#5C6B34] text-xs font-bold border border-[#CCD5AE] transition shadow-sm group"
        >
          <Repeat className="w-3.5 h-3.5 text-[#386641] group-hover:text-white transition" /> Gjør til rundtur
        </button>
      </div>

      {/*
        The route recalculates itself whenever the points or the preferences
        change, so there is no button to press — this says where that stands.
        The only thing worth a button is a failed attempt.
      */}
      <div
        aria-live="polite"
        className={`mt-1 rounded-xl border px-3.5 py-3 text-xs font-bold flex items-center gap-2 ${
          routeError
            ? 'bg-rose-50 border-rose-200 text-[#BC4749]'
            : summary && !isBusy
              ? 'bg-[#E9EDC9] border-[#CCD5AE] text-[#5C6B34]'
              : 'bg-[#F9F9F7] border-[#E0E0D6] text-[#6B705C]'
        }`}
      >
        {routeError ? (
          <>
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-semibold leading-relaxed">{routeError}</span>
            <button
              type="button"
              onClick={onRetryRoute}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-[#BC4749] text-white font-bold hover:bg-[#9B383A] transition"
            >
              Prøv igjen
            </button>
          </>
        ) : isBusy ? (
          <>
            <Loader2 className="w-4 h-4 shrink-0 animate-spin text-[#386641]" />
            <span>Beregner rute...</span>
          </>
        ) : summary ? (
          <>
            <Flame className="w-4 h-4 shrink-0 text-[#386641]" />
            <span>
              Rute klar · {Math.round(summary.distanceKm)} km · {formatDuration(summary.durationMin)}
            </span>
          </>
        ) : (
          <>
            <MousePointerClick className="w-4 h-4 shrink-0 text-[#386641]" />
            <span className="font-semibold leading-relaxed">
              {placedCount === 0
                ? 'Klikk i kartet eller søk opp steder — ruta beregnes så snart to punkter er satt.'
                : 'Sett ett punkt til, så beregnes ruta automatisk.'}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
