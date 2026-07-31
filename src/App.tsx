import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  HazardReport,
  Notice,
  PresetRoute,
  RouteProfile,
  RouteResult,
  SavedTour,
  WeatherCheckpoint,
  Waypoint,
} from './types';
import {
  ApiError,
  fetchHazards,
  fetchNearbyRoute,
  fetchRoute,
  fetchWeather,
  reverseGeocode,
  type WeatherRequestPoint,
} from './api';
import { PRESET_ROUTES } from './data/presetRoutes';
import { cumulativeDistancesKm, hasCoords, haversineDistance } from './utils/geo';
import { decodeRouteFromHash, encodeRouteToHash } from './utils/routeLink';
import { Header } from './components/Header';
import { RouteEditor } from './components/RouteEditor';
import { MapView } from './components/MapView';
import { WeatherWidget } from './components/WeatherWidget';
import { HazardBanner } from './components/HazardBanner';
import { ExportModal } from './components/ExportModal';
import { SavedToursDrawer } from './components/SavedToursDrawer';
import { PresetRoutesModal } from './components/PresetRoutesModal';
import { NearbyRouteModal } from './components/NearbyRouteModal';
import { NearbyLoopModal } from './components/NearbyLoopModal';
import { NoticeStack } from './components/NoticeStack';

// The charting library is a large share of the bundle and is only needed once a
// route exists, so it is fetched separately rather than on first paint — this
// app is opened on mobile data more often than not.
const ElevationChart = lazy(() =>
  import('./components/ElevationChart').then((m) => ({ default: m.ElevationChart }))
);

const emptyWaypoints = (): Waypoint[] => [
  { id: `wp_start_${Date.now()}`, name: '', lat: 0, lng: 0 },
  { id: `wp_end_${Date.now() + 1}`, name: '', lat: 0, lng: 0 },
];

/** Default departure is the next whole hour — nobody sets off at 14:37. */
function nextWholeHour(): Date {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

/** `datetime-local` inputs want local wall-clock time without a timezone. */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(emptyWaypoints);
  const [profile, setProfile] = useState<RouteProfile>('curvy');
  const [avoidHighways, setAvoidHighways] = useState(true);
  const [departureTime, setDepartureTime] = useState(() => toDateTimeLocal(nextWholeHour()));

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [weather, setWeather] = useState<WeatherCheckpoint[]>([]);
  const [hazardReport, setHazardReport] = useState<HazardReport | null>(null);

  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [isSuggestingLocation, setIsSuggestingLocation] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isNearbyModalOpen, setIsNearbyModalOpen] = useState(false);
  const [nearbySuggestions, setNearbySuggestions] = useState<
    { preset: PresetRoute; distanceKm: number }[]
  >([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [isLoopModalOpen, setIsLoopModalOpen] = useState(false);
  const [loopRadiusKm, setLoopRadiusKm] = useState(40);
  const [isGeneratingLoop, setIsGeneratingLoop] = useState(false);
  const [loopResult, setLoopResult] = useState<RouteResult | null>(null);

  /** Lets a newer route request cancel one still in flight. */
  const routeRequestRef = useRef<AbortController | null>(null);

  const savedTours = useLiveQuery(() => db.tours.orderBy('createdAt').reverse().toArray()) || [];

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const pushNotice = useCallback((tone: Notice['tone'], message: string) => {
    const id = `notice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setNotices((prev) => [...prev.filter((n) => n.message !== message), { id, tone, message }]);

    if (tone === 'info') {
      setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 6000);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Weather                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Picks checkpoints along the route and works out roughly when the rider
   * reaches each one, so the forecast describes the hour they will actually be
   * there rather than the moment they pressed the button.
   */
  const loadWeather = useCallback(
    async (result: RouteResult, placed: Waypoint[], departure: Date) => {
      const { polyline, durationMin } = result;
      if (polyline.length < 2) return;

      const distances = cumulativeDistancesKm(polyline);
      const totalKm = distances[distances.length - 1];
      if (totalKm <= 0) return;

      const fractions = [0, 0.25, 0.5, 0.75, 1];
      const points: WeatherRequestPoint[] = fractions.map((fraction) => {
        const targetKm = totalKm * fraction;
        let index = distances.findIndex((d) => d >= targetKm);
        if (index === -1) index = polyline.length - 1;

        const [lat, lng] = polyline[index];
        const eta = new Date(departure.getTime() + durationMin * fraction * 60_000);

        return { lat, lng, label: labelForCheckpoint(fraction, lat, lng, placed, targetKm), time: eta.toISOString() };
      });

      setIsLoadingWeather(true);
      try {
        const { weather: checkpoints } = await fetchWeather(points);
        setWeather(checkpoints);

        if (checkpoints.every((c) => c.forecast === null)) {
          pushNotice('info', 'Værvarselet er utilgjengelig akkurat nå. Ruten er beregnet uten det.');
        }
      } catch (err) {
        setWeather([]);
        console.warn('Weather fetch failed:', err);
      } finally {
        setIsLoadingWeather(false);
      }
    },
    [pushNotice]
  );

  /* ---------------------------------------------------------------- */
  /* Routing                                                           */
  /* ---------------------------------------------------------------- */

  const calculateRoute = useCallback(
    async (
      currentWaypoints: Waypoint[],
      currentProfile: RouteProfile,
      currentAvoidHighways: boolean,
      currentDeparture: string
    ) => {
      const placed = currentWaypoints.filter(hasCoords);
      if (placed.length < 2) return;

      routeRequestRef.current?.abort();
      const controller = new AbortController();
      routeRequestRef.current = controller;

      setIsLoadingRoute(true);

      try {
        const result = await fetchRoute(placed, currentProfile, currentAvoidHighways, controller.signal);
        if (controller.signal.aborted) return;

        setRoute(result);
        setNotices((prev) => prev.filter((n) => n.tone !== 'error'));

        // Keep the address bar in sync so the rider can just copy the URL.
        const hash = encodeRouteToHash(placed, currentProfile, currentAvoidHighways);
        if (hash) window.history.replaceState(null, '', hash);

        const departure = new Date(currentDeparture);
        void loadWeather(result, placed, Number.isNaN(departure.getTime()) ? new Date() : departure);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message =
          err instanceof ApiError ? err.message : 'Kunne ikke beregne MC-rute. Prøv igjen.';
        pushNotice('error', message);
      } finally {
        if (routeRequestRef.current === controller) {
          setIsLoadingRoute(false);
          routeRequestRef.current = null;
        }
      }
    },
    [loadWeather, pushNotice]
  );

  /* ---------------------------------------------------------------- */
  /* Startup: shared link + mountain pass status                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    fetchHazards()
      .then(setHazardReport)
      .catch((err) => console.warn('Failed to load mountain pass status:', err));
  }, []);

  const loadSharedRoute = useCallback(() => {
    const shared = decodeRouteFromHash(window.location.hash);
    if (!shared) return;

    setWaypoints(shared.waypoints);
    setProfile(shared.profile);
    setAvoidHighways(shared.avoidHighways);
    pushNotice('info', 'Delt rute lastet inn.');
    void calculateRoute(
      shared.waypoints,
      shared.profile,
      shared.avoidHighways,
      toDateTimeLocal(nextWholeHour())
    );
  }, [calculateRoute, pushNotice]);

  useEffect(() => {
    loadSharedRoute();

    // Opening a shared link while the app is already running only changes the
    // hash, which does not remount anything — without this, the rider would
    // click a mate's route and watch nothing happen. Our own replaceState calls
    // do not fire this event.
    window.addEventListener('hashchange', loadSharedRoute);
    return () => window.removeEventListener('hashchange', loadSharedRoute);
    // Deliberately mount-only: re-running this on every render of
    // loadSharedRoute would reload the shared route mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /* Waypoint editing                                                  */
  /* ---------------------------------------------------------------- */

  const nameWaypointFromCoords = useCallback(async (id: string, lat: number, lng: number) => {
    try {
      const name = await reverseGeocode(lat, lng);
      if (!name) return;
      setWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, name } : wp)));
    } catch {
      // A missing place name is cosmetic; the coordinates already work.
    }
  }, []);

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      const placeholder = `Kartpunkt (${lat.toFixed(3)}, ${lng.toFixed(3)})`;

      // Build the next list synchronously so the route request below always
      // sees exactly what the user just placed, even on rapid clicks.
      const emptyIndex = waypoints.findIndex((wp) => !hasCoords(wp));
      let next: Waypoint[];
      let targetId: string;

      if (emptyIndex !== -1) {
        targetId = waypoints[emptyIndex].id;
        next = waypoints.map((wp, idx) =>
          idx === emptyIndex ? { ...wp, lat, lng, name: placeholder } : wp
        );
      } else {
        targetId = `wp_map_${Date.now()}`;
        const newWaypoint: Waypoint = { id: targetId, name: placeholder, lat, lng };
        next = [...waypoints];
        next.splice(Math.max(1, next.length - 1), 0, newWaypoint);
      }

      setWaypoints(next);
      void nameWaypointFromCoords(targetId, lat, lng);

      if (next.filter(hasCoords).length >= 2) {
        void calculateRoute(next, profile, avoidHighways, departureTime);
      }
    },
    [waypoints, profile, avoidHighways, departureTime, calculateRoute, nameWaypointFromCoords]
  );

  const handleClearWaypoints = useCallback(() => {
    routeRequestRef.current?.abort();
    setWaypoints(emptyWaypoints());
    setRoute(null);
    setWeather([]);
    setNotices([]);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  const handleSetProfile = useCallback((next: RouteProfile) => {
    setProfile(next);
    if (next !== 'fastest') setAvoidHighways(true);
  }, []);

  const handleMakeRoundTrip = useCallback(() => {
    const placed = waypoints.filter(hasCoords);
    if (placed.length === 0) {
      pushNotice('error', 'Sett et startsted i kartet eller søkefeltet før du lager en rundtur.');
      return;
    }

    const start = placed[0];
    const last = placed[placed.length - 1];
    if (
      placed.length > 1 &&
      Math.abs(last.lat - start.lat) < 0.0001 &&
      Math.abs(last.lng - start.lng) < 0.0001
    ) {
      pushNotice('info', 'Ruten slutter allerede der den startet.');
      return;
    }

    const returnWaypoint: Waypoint = {
      id: `wp_round_${Date.now()}`,
      name: start.name ? `${start.name} (retur)` : 'Startsted (retur)',
      lat: start.lat,
      lng: start.lng,
    };

    const lastIndex = waypoints.length - 1;
    const next =
      lastIndex > 0 && !hasCoords(waypoints[lastIndex])
        ? waypoints.map((wp, idx) => (idx === lastIndex ? returnWaypoint : wp))
        : [...waypoints, returnWaypoint];

    setWaypoints(next);
    if (next.filter(hasCoords).length >= 2) {
      void calculateRoute(next, profile, avoidHighways, departureTime);
    }
  }, [waypoints, profile, avoidHighways, departureTime, calculateRoute, pushNotice]);

  /* ---------------------------------------------------------------- */
  /* Presets, geolocation and saved tours                              */
  /* ---------------------------------------------------------------- */

  const applyPreset = useCallback(
    (preset: PresetRoute, startFromUser: boolean) => {
      const stamp = Date.now();
      const presetWaypoints: Waypoint[] = preset.waypoints.map((wp, idx) => ({
        id: `preset_wp_${idx}_${stamp}`,
        name: wp.name,
        lat: wp.lat,
        lng: wp.lng,
      }));

      const next =
        startFromUser && userCoords
          ? [
              { id: `wp_user_${stamp}`, name: 'Min posisjon', ...userCoords },
              ...presetWaypoints.slice(1),
            ]
          : presetWaypoints;

      setWaypoints(next);
      setProfile('curvy');
      setAvoidHighways(true);
      void calculateRoute(next, 'curvy', true, departureTime);
    },
    [userCoords, departureTime, calculateRoute]
  );

  const handleSuggestNearby = useCallback(() => {
    if (!navigator.geolocation) {
      pushNotice('error', 'Geolokasjon støttes ikke i denne nettleseren.');
      return;
    }

    setIsSuggestingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLoopResult(null);
        setIsSuggestingLocation(false);
        setIsLoopModalOpen(true);
      },
      (error) => {
        setIsSuggestingLocation(false);
        pushNotice('error', `Kunne ikke hente posisjon: ${error.message}. Tillat posisjon i nettleseren.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [pushNotice]);

  const handleShowPresetsInstead = useCallback(() => {
    if (!userCoords) return;
    setNearbySuggestions(
      PRESET_ROUTES.map((preset) => ({
        preset,
        distanceKm: Math.round(
          haversineDistance(userCoords.lat, userCoords.lng, preset.waypoints[0].lat, preset.waypoints[0].lng)
        ),
      })).sort((a, b) => a.distanceKm - b.distanceKm)
    );
    setIsLoopModalOpen(false);
    setIsNearbyModalOpen(true);
  }, [userCoords]);

  const handleGenerateLoop = useCallback(async () => {
    if (!userCoords) return;

    setIsGeneratingLoop(true);
    try {
      const result = await fetchNearbyRoute(userCoords.lat, userCoords.lng, loopRadiusKm);
      setLoopResult(result);
      setRoute(result);
      setProfile('curvy');
      setAvoidHighways(true);

      const stamp = Date.now();
      const loopWaypoints: Waypoint[] = [
        { id: `loop_start_${stamp}`, name: 'Din posisjon (start)', ...userCoords },
        { id: `loop_end_${stamp}`, name: 'Din posisjon (slutt)', ...userCoords },
      ];
      setWaypoints(loopWaypoints);
      setNotices((prev) => prev.filter((n) => n.tone !== 'error'));

      const hash = encodeRouteToHash(loopWaypoints, 'curvy', true);
      if (hash) window.history.replaceState(null, '', hash);

      const departure = new Date(departureTime);
      void loadWeather(result, loopWaypoints, Number.isNaN(departure.getTime()) ? new Date() : departure);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Kunne ikke lage rundtur. Prøv igjen.';
      pushNotice('error', message);
    } finally {
      setIsGeneratingLoop(false);
    }
  }, [userCoords, loopRadiusKm, departureTime, loadWeather, pushNotice]);

  const handleSaveTour = useCallback(
    async (title: string, notes: string) => {
      if (!route) return;
      const tour: SavedTour = {
        id: `tour_${Date.now()}`,
        title,
        notes,
        createdAt: new Date().toISOString(),
        waypoints: waypoints.filter(hasCoords),
        profile,
        avoidHighways,
        distanceKm: route.summary.distanceKm,
        durationMin: route.summary.durationMin,
        elevationGainM: route.summary.elevationGainM,
        maxElevationM: route.summary.maxElevationM,
      };
      await db.tours.add(tour);
    },
    [route, waypoints, profile, avoidHighways]
  );

  const handleLoadTour = useCallback(
    (tour: SavedTour) => {
      const avoid = tour.avoidHighways ?? tour.profile !== 'fastest';
      setWaypoints(tour.waypoints);
      setProfile(tour.profile);
      setAvoidHighways(avoid);
      setIsSavedOpen(false);
      void calculateRoute(tour.waypoints, tour.profile, avoid, departureTime);
    },
    [departureTime, calculateRoute]
  );

  const handleDeleteTour = useCallback(async (id: string) => {
    await db.tours.delete(id);
  }, []);

  const handleDepartureChange = useCallback(
    (next: string) => {
      setDepartureTime(next);
      const placed = waypoints.filter(hasCoords);
      const departure = new Date(next);
      if (route && placed.length >= 2 && !Number.isNaN(departure.getTime())) {
        void loadWeather(route, placed, departure);
      }
    },
    [route, waypoints, loadWeather]
  );

  const polyline = route?.polyline ?? [];

  return (
    <div className="min-h-screen bg-[#F4F4EF] text-[#2D332A] flex flex-col font-sans selection:bg-[#A7C957] selection:text-[#2D332A]">
      <Header
        onOpenPresets={() => setIsPresetsOpen(true)}
        onOpenSavedTours={() => setIsSavedOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        savedToursCount={savedTours.length}
        hasRoute={polyline.length > 0}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        <HazardBanner report={hazardReport} />

        <NoticeStack notices={notices} onDismiss={dismissNotice} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-4">
            <RouteEditor
              waypoints={waypoints}
              setWaypoints={setWaypoints}
              profile={profile}
              setProfile={handleSetProfile}
              avoidHighways={avoidHighways}
              setAvoidHighways={setAvoidHighways}
              departureTime={departureTime}
              setDepartureTime={handleDepartureChange}
              onCalculateRoute={() => calculateRoute(waypoints, profile, avoidHighways, departureTime)}
              onClearWaypoints={handleClearWaypoints}
              onMakeRoundTrip={handleMakeRoundTrip}
              onSuggestNearby={handleSuggestNearby}
              onNotify={pushNotice}
              isSuggestingLocation={isSuggestingLocation}
              isLoading={isLoadingRoute}
            />
          </div>

          <div className="lg:col-span-8 space-y-4 flex flex-col">
            <div className="h-[420px] sm:h-[480px] w-full">
              <MapView
                polyline={polyline}
                waypoints={waypoints}
                weather={weather}
                passes={hazardReport?.passes ?? []}
                onMapClick={handleMapClick}
              />
            </div>

            <WeatherWidget
              checkpoints={weather}
              isLoading={isLoadingWeather}
              hasRoute={polyline.length > 0}
            />

            <Suspense
              fallback={
                <div className="bg-white border border-[#E0E0D6] rounded-2xl p-5 shadow-sm text-center text-xs text-[#6B705C]">
                  Laster høydeprofil...
                </div>
              }
            >
              <ElevationChart
                summary={route?.summary}
                elevationPoints={route?.elevationPoints ?? []}
                sources={route?.sources}
                notes={route?.notes ?? []}
              />
            </Suspense>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-[#E0E0D6] text-xs text-[#6B705C] py-4 px-5 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>Sving — norsk MC-turplanlegger for svingete veier. Gratis og uten sporing.</p>
          <p className="text-[11px]">
            Kart fra OpenStreetMap og Kartverket. Vær fra MET.no. Ruting fra OSRM.
          </p>
        </div>
      </footer>

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        waypoints={waypoints}
        route={route}
        profile={profile}
        avoidHighways={avoidHighways}
        onSaveTour={handleSaveTour}
        onNotify={pushNotice}
      />

      <SavedToursDrawer
        isOpen={isSavedOpen}
        onClose={() => setIsSavedOpen(false)}
        tours={savedTours}
        onLoadTour={handleLoadTour}
        onDeleteTour={handleDeleteTour}
      />

      <PresetRoutesModal
        isOpen={isPresetsOpen}
        onClose={() => setIsPresetsOpen(false)}
        onSelectPreset={(preset) => {
          setIsPresetsOpen(false);
          applyPreset(preset, false);
        }}
      />

      <NearbyRouteModal
        isOpen={isNearbyModalOpen}
        onClose={() => setIsNearbyModalOpen(false)}
        suggestions={nearbySuggestions}
        onSelectRoute={(preset, startFromUser) => {
          setIsNearbyModalOpen(false);
          applyPreset(preset, startFromUser);
        }}
      />

      <NearbyLoopModal
        isOpen={isLoopModalOpen}
        onClose={() => setIsLoopModalOpen(false)}
        radiusKm={loopRadiusKm}
        onRadiusChange={setLoopRadiusKm}
        onGenerate={handleGenerateLoop}
        isGenerating={isGeneratingLoop}
        result={loopResult}
        onShowPresetsInstead={handleShowPresetsInstead}
      />
    </div>
  );
}

/** Names a weather checkpoint after the nearest waypoint, when there is one close by. */
function labelForCheckpoint(
  fraction: number,
  lat: number,
  lng: number,
  placed: Waypoint[],
  distanceAlongKm: number
): string {
  if (fraction === 0 && placed[0]?.name) return placed[0].name;
  if (fraction === 1 && placed[placed.length - 1]?.name) return placed[placed.length - 1].name;

  let nearest: Waypoint | null = null;
  let nearestKm = Infinity;
  for (const wp of placed) {
    const distance = haversineDistance(lat, lng, wp.lat, wp.lng);
    if (distance < nearestKm) {
      nearestKm = distance;
      nearest = wp;
    }
  }

  if (nearest && nearest.name && nearestKm < 15) return nearest.name;
  return `Underveis (${Math.round(distanceAlongKm)} km)`;
}
