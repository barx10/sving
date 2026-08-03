import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  HazardReport,
  Notice,
  PointOfInterest,
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
  fetchPois,
  fetchRoute,
  fetchWeather,
  reverseGeocode,
  type WeatherRequestPoint,
} from './api';
import { PRESET_ROUTES } from './data/presetRoutes';
import { cumulativeDistancesKm, hasCoords, haversineDistance } from './utils/geo';
import { pickWeatherFractions } from './utils/weatherCheckpoints';
import { orderAlongRoute, sampleRouteForPois } from './utils/pois';
import { decodeRouteFromHash, encodeRouteToHash } from './utils/routeLink';
import { routeSignatureOf } from './utils/routeSignature';
import { GeolocationError, getRiderPosition } from './utils/geolocation';
import type { ImportedRoute } from './utils/gpxImport';
import { Header } from './components/Header';
import { MAX_WAYPOINTS, RouteEditor } from './components/RouteEditor';
import { MapView } from './components/MapView';
import { WeatherWidget } from './components/WeatherWidget';
import { RoutePanel, type PoiStatus, type RouteLayer } from './components/RoutePanel';
import { DirectionsPanel } from './components/DirectionsPanel';
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

/** Long enough to swallow a burst of map clicks, short enough to feel immediate. */
const AUTO_ROUTE_DEBOUNCE_MS = 350;

export default function App() {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(emptyWaypoints);
  const [profile, setProfile] = useState<RouteProfile>('curvy');
  const [avoidHighways, setAvoidHighways] = useState(true);
  const [departureTime, setDepartureTime] = useState(() => toDateTimeLocal(nextWholeHour()));

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [weather, setWeather] = useState<WeatherCheckpoint[]>([]);
  const [hazardReport, setHazardReport] = useState<HazardReport | null>(null);

  // The route panel is folded away until asked for, and what it shows is also
  // what the map shows — one control, never out of sync.
  const [isRoutePanelOpen, setIsRoutePanelOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<RouteLayer>('passes');
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [pois, setPois] = useState<PointOfInterest[]>([]);
  const [poiStatus, setPoiStatus] = useState<PoiStatus>('idle');
  const [poiError, setPoiError] = useState<string | null>(null);

  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  /** Shown in the planner's status line, next to the button that retries it. */
  const [routeError, setRouteError] = useState<string | null>(null);
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
  const poiRequestRef = useRef<AbortController | null>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  /**
   * The route the auto-routing effect has already asked for. Anything that
   * produces a route by other means — the nearby-loop generator — writes its
   * signature here so the effect does not immediately overwrite it with a plain
   * A-to-B route between the same two points.
   */
  const routedSignatureRef = useRef<string | null>(null);
  /**
   * Read by the auto-routing effect without subscribing to it: the departure
   * time only decides which forecast hour to ask for, and changing it already
   * refreshes the weather on its own.
   */
  const departureTimeRef = useRef(departureTime);
  departureTimeRef.current = departureTime;

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

      const fractions = pickWeatherFractions(durationMin);
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
  /* Fuel and rest areas along the route                               */
  /* ---------------------------------------------------------------- */

  /**
   * Overpass is the strictest upstream this app talks to, so the corridor
   * search happens once per route and only when the rider actually opens one of
   * those tabs. Both categories arrive together, which makes switching between
   * Bensin and Rasteplasser free.
   */
  const loadPois = useCallback(async (routePolyline: [number, number][]) => {
    if (routePolyline.length < 2) return;

    poiRequestRef.current?.abort();
    const controller = new AbortController();
    poiRequestRef.current = controller;

    setPoiStatus('loading');
    setPoiError(null);

    try {
      const found = await fetchPois(sampleRouteForPois(routePolyline), controller.signal);
      if (controller.signal.aborted) return;

      setPois(orderAlongRoute(found, routePolyline));
      setPoiStatus('ready');
    } catch (err) {
      if (controller.signal.aborted) return;
      setPoiError(err instanceof ApiError ? err.message : 'Kunne ikke søke langs ruta.');
      setPoiStatus('error');
    } finally {
      if (poiRequestRef.current === controller) poiRequestRef.current = null;
    }
  }, []);

  /** A new route invalidates everything we found along the old one. */
  const resetPois = useCallback(() => {
    poiRequestRef.current?.abort();
    poiRequestRef.current = null;
    setPois([]);
    setPoiStatus('idle');
    setPoiError(null);
    setFocusedId(null);
  }, []);

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

      routedSignatureRef.current = routeSignatureOf(placed, currentProfile, currentAvoidHighways);
      setIsLoadingRoute(true);
      setRouteError(null);

      try {
        const result = await fetchRoute(placed, currentProfile, currentAvoidHighways, controller.signal);
        if (controller.signal.aborted) return;

        setRoute(result);
        resetPois();
        setNotices((prev) => prev.filter((n) => n.tone !== 'error'));

        // Keep the address bar in sync so the rider can just copy the URL.
        const hash = encodeRouteToHash(placed, currentProfile, currentAvoidHighways);
        if (hash) window.history.replaceState(null, '', hash);

        const departure = new Date(currentDeparture);
        void loadWeather(result, placed, Number.isNaN(departure.getTime()) ? new Date() : departure);
      } catch (err) {
        if (controller.signal.aborted) return;
        // The planner's status line owns this one: it sits where the rider is
        // looking and carries the retry button, so a toast would only repeat it.
        setRouteError(err instanceof ApiError ? err.message : 'Kunne ikke beregne MC-rute.');
      } finally {
        if (routeRequestRef.current === controller) {
          setIsLoadingRoute(false);
          routeRequestRef.current = null;
        }
      }
    },
    [loadWeather, resetPois]
  );

  /**
   * Routes calculate themselves. Every path into the planner — a map click, a
   * search hit, a preset, a shared link, a changed preference — lands in these
   * three pieces of state, so watching them covers the lot and there is nothing
   * left for the rider to press.
   */
  const placedWaypoints = useMemo(() => waypoints.filter(hasCoords), [waypoints]);
  const routeSignature = routeSignatureOf(placedWaypoints, profile, avoidHighways);

  useEffect(() => {
    if (placedWaypoints.length < 2) return;
    if (routedSignatureRef.current === routeSignature) return;

    const timer = setTimeout(
      () => void calculateRoute(placedWaypoints, profile, avoidHighways, departureTimeRef.current),
      AUTO_ROUTE_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [routeSignature, placedWaypoints, profile, avoidHighways, calculateRoute]);

  /** Dropping below two points leaves nothing to draw — clear rather than lie. */
  useEffect(() => {
    if (placedWaypoints.length >= 2) return;

    routedSignatureRef.current = null;
    if (!route) return;

    routeRequestRef.current?.abort();
    setRoute(null);
    setWeather([]);
    setRouteError(null);
    resetPois();
  }, [placedWaypoints, route, resetPois]);

  /** After a failed attempt the signature is unchanged, so retrying needs a nudge. */
  const handleRetryRoute = useCallback(() => {
    routedSignatureRef.current = null;
    void calculateRoute(placedWaypoints, profile, avoidHighways, departureTime);
  }, [placedWaypoints, profile, avoidHighways, departureTime, calculateRoute]);

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
  }, [pushNotice]);

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

      // Fill the first empty row if there is one, otherwise slot the point in
      // just before the finish — a click is a via point once A and B are set.
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
    },
    [waypoints, nameWaypointFromCoords]
  );

  const handleClearWaypoints = useCallback(() => {
    routeRequestRef.current?.abort();
    setWaypoints(emptyWaypoints());
    setRoute(null);
    setWeather([]);
    setRouteError(null);
    setNotices([]);
    resetPois();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [resetPois]);

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
  }, [waypoints, pushNotice]);

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
    },
    [userCoords]
  );

  const handleSuggestNearby = useCallback(async () => {
    setIsSuggestingLocation(true);

    try {
      setUserCoords(await getRiderPosition());
      setLoopResult(null);
      setIsLoopModalOpen(true);
    } catch (err) {
      pushNotice(
        'error',
        err instanceof GeolocationError ? err.message : 'Kunne ikke hente posisjonen din.'
      );
    } finally {
      setIsSuggestingLocation(false);
    }
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
      resetPois();
      setProfile('curvy');
      setAvoidHighways(true);

      const stamp = Date.now();
      const loopWaypoints: Waypoint[] = [
        { id: `loop_start_${stamp}`, name: 'Din posisjon (start)', ...userCoords },
        { id: `loop_end_${stamp}`, name: 'Din posisjon (slutt)', ...userCoords },
      ];

      // The loop came from its own endpoint, so tell the auto-routing effect the
      // two points are already handled — otherwise it would replace the round
      // trip with an empty A-to-A route between start and finish.
      routedSignatureRef.current = routeSignatureOf(loopWaypoints, 'curvy', true);
      setWaypoints(loopWaypoints);
      setRouteError(null);
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
  }, [userCoords, loopRadiusKm, departureTime, loadWeather, resetPois, pushNotice]);

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
    },
    []
  );

  /**
   * Points from a GPX file become ordinary waypoints, and the auto-routing
   * effect takes it from there. What the rider is told depends on what the file
   * held: a planned route comes back as itself, while a recorded track is a
   * line of thousands of points that has to be rebuilt through a handful of
   * them — and a rebuilt route can follow a different road than the one ridden.
   */
  const handleImportRoute = useCallback(
    (imported: ImportedRoute) => {
      const stamp = Date.now();
      setWaypoints(
        imported.points.map((point, index) => ({
          id: `gpx_${index}_${stamp}`,
          name: point.name || `Importert punkt ${index + 1}`,
          lat: point.lat,
          lng: point.lng,
        }))
      );

      const thinned = imported.originalCount > imported.points.length;

      if (imported.source === 'track') {
        pushNotice(
          'info',
          `Sporet hadde ${imported.originalCount} punkter. Ruta er bygget på nytt gjennom ${imported.points.length} av dem, og kan følge en annen vei enn originalen.`
        );
      } else if (thinned) {
        pushNotice(
          'info',
          `Fila hadde ${imported.originalCount} punkter — de ${imported.points.length} som får plass er beholdt.`
        );
      } else {
        pushNotice('info', `Hentet inn ${imported.points.length} rutepunkter fra GPX-fila.`);
      }
    },
    [pushNotice]
  );

  const handleDeleteTour = useCallback(async (id: string) => {
    await db.tours.delete(id);
  }, []);

  const handleToggleRoutePanel = useCallback(() => {
    setIsRoutePanelOpen((prev) => !prev);
    setFocusedId(null);
  }, []);

  const handleLayerChange = useCallback((layer: RouteLayer) => {
    setActiveLayer(layer);
    setFocusedId(null);
  }, []);

  /**
   * Picking a place is only useful if the map is on screen. On the stacked
   * mobile layout it sits below the planner, so bring it into view — but never
   * yank the page around when it is already visible, as on desktop.
   */
  const handleFocusItem = useCallback((id: string | null) => {
    setFocusedId(id);
    if (!id) return;

    const element = mapSectionRef.current;
    if (!element) return;

    const { top, bottom, height } = element.getBoundingClientRect();
    const visibleHeight = Math.min(bottom, window.innerHeight) - Math.max(top, 0);
    const fitsOnScreen = Math.min(height, window.innerHeight);

    // A couple of pixels of slack keeps the desktop layout, where the map is
    // already fully in view, perfectly still.
    if (visibleHeight < fitsOnScreen - 4) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
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

  /**
   * The corridor search waits for the rider to ask for it: opening the panel on
   * one of those tabs is the trigger, and the result is kept until the route
   * changes. Overpass never hears about a route nobody looked up.
   */
  useEffect(() => {
    if (!isRoutePanelOpen || activeLayer === 'passes') return;
    if (polyline.length < 2 || poiStatus !== 'idle') return;
    void loadPois(polyline);
  }, [isRoutePanelOpen, activeLayer, polyline, poiStatus, loadPois]);

  useEffect(() => () => poiRequestRef.current?.abort(), []);

  // The map shows exactly what the panel is showing, and nothing when it is
  // closed. Keeping the decision here means MapView never learns about tabs.
  const visiblePasses = useMemo(
    () =>
      isRoutePanelOpen && activeLayer === 'passes' ? (hazardReport?.passes ?? []) : [],
    [isRoutePanelOpen, activeLayer, hazardReport]
  );

  const visiblePois = useMemo(
    () =>
      isRoutePanelOpen && activeLayer !== 'passes'
        ? pois.filter((poi) => poi.category === activeLayer)
        : [],
    [isRoutePanelOpen, activeLayer, pois]
  );

  return (
    <div className="min-h-screen bg-[#F4F4EF] text-[#2D332A] flex flex-col font-sans selection:bg-[#A7C957] selection:text-[#2D332A]">
      <Header
        onOpenPresets={() => setIsPresetsOpen(true)}
        onOpenSavedTours={() => setIsSavedOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        savedToursCount={savedTours.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
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
              onClearWaypoints={handleClearWaypoints}
              onMakeRoundTrip={handleMakeRoundTrip}
              onSuggestNearby={handleSuggestNearby}
              onNotify={pushNotice}
              onRetryRoute={handleRetryRoute}
              summary={route?.summary ?? null}
              routeError={routeError}
              isSuggestingLocation={isSuggestingLocation}
              isLoading={isLoadingRoute}
            />

            <RoutePanel
              report={hazardReport}
              pois={pois}
              poiStatus={poiStatus}
              poiError={poiError}
              hasRoute={polyline.length > 1}
              isOpen={isRoutePanelOpen}
              onToggle={handleToggleRoutePanel}
              activeLayer={activeLayer}
              onLayerChange={handleLayerChange}
              focusedId={focusedId}
              onFocusItem={handleFocusItem}
              onRetryPois={() => loadPois(polyline)}
            />
          </div>

          <div className="lg:col-span-8 space-y-4 flex flex-col">
            <div ref={mapSectionRef} className="h-[420px] sm:h-[480px] w-full">
              <MapView
                polyline={polyline}
                waypoints={waypoints}
                weather={weather}
                passes={visiblePasses}
                pois={visiblePois}
                focusedId={focusedId}
                onFocusItem={handleFocusItem}
                onMapClick={handleMapClick}
              />
            </div>

            <WeatherWidget
              checkpoints={weather}
              isLoading={isLoadingWeather}
              hasRoute={polyline.length > 0}
            />

            <DirectionsPanel steps={route?.steps ?? []} hasRoute={polyline.length > 1} />

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
        onImportRoute={handleImportRoute}
        maxWaypoints={MAX_WAYPOINTS}
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
