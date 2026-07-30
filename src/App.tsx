import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type {
  Waypoint,
  RouteProfile,
  RouteSummary,
  ElevationPoint,
  WeatherPoint,
  RoadHazard,
  SavedTour,
  PresetRoute,
} from './types';
import { PRESET_ROUTES } from './data/presetRoutes';
import { haversineDistance } from './utils/geo';
import { Header } from './components/Header';
import { RouteEditor } from './components/RouteEditor';
import { MapView } from './components/MapView';
import { ElevationChart } from './components/ElevationChart';
import { WeatherWidget } from './components/WeatherWidget';
import { HazardBanner } from './components/HazardBanner';
import { ExportModal } from './components/ExportModal';
import { SavedToursDrawer } from './components/SavedToursDrawer';
import { PresetRoutesModal } from './components/PresetRoutesModal';
import { NearbyRouteModal } from './components/NearbyRouteModal';
import { AlertCircle } from 'lucide-react';

export default function App() {
  // Initial waypoints start clean and empty for a smooth user experience
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { id: 'wp_start', name: '', lat: 0, lng: 0 },
    { id: 'wp_end', name: '', lat: 0, lng: 0 },
  ]);

  const [profile, setProfile] = useState<RouteProfile>('curvy');
  const [avoidHighways, setAvoidHighways] = useState<boolean>(true);
  const [polyline, setPolyline] = useState<[number, number][]>([]);
  const [elevationPoints, setElevationPoints] = useState<ElevationPoint[]>([]);
  const [summary, setSummary] = useState<RouteSummary | undefined>(undefined);
  const [weatherPoints, setWeatherPoints] = useState<WeatherPoint[]>([]);
  const [hazards, setHazards] = useState<RoadHazard[]>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Drawers
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  
  // Location Suggestion State
  const [isNearbyModalOpen, setIsNearbyModalOpen] = useState(false);
  const [isSuggestingLocation, setIsSuggestingLocation] = useState(false);
  const [nearbySuggestions, setNearbySuggestions] = useState<{ preset: PresetRoute; distanceKm: number }[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Live Query from Dexie IndexedDB
  const savedTours = useLiveQuery(() => db.tours.orderBy('createdAt').reverse().toArray()) || [];

  // Handle Profile Selection
  const handleSetProfile = (p: RouteProfile) => {
    setProfile(p);
    if (p === 'curvy' || p === 'scenic') {
      setAvoidHighways(true);
    }
  };

  // Load road hazards on mount (no default pre-filled route)
  useEffect(() => {
    fetchHazards();
  }, []);

  // Reverse geocoding helper using OSM Nominatim
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
        headers: {
          'Accept-Language': 'no,nb,en',
          'User-Agent': 'SvingMCPlanner/1.0',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address;
        if (addr) {
          const mainName = addr.village || addr.town || addr.city || addr.municipality || addr.suburb || addr.road;
          if (mainName) return mainName;
        }
        if (data.display_name) {
          return data.display_name.split(',')[0];
        }
      }
    } catch {
      // Ignore network errors
    }
    return `Kartpunkt (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  };

  // Handle direct click on map to set start, via, or destination point
  const handleMapClick = async (lat: number, lng: number) => {
    const emptyIndex = waypoints.findIndex((wp) => wp.lat === 0 || wp.lng === 0);
    let updatedWps: Waypoint[] = [...waypoints];
    const initialName = `Henter sted... (${lat.toFixed(3)}, ${lng.toFixed(3)})`;

    if (emptyIndex !== -1) {
      // Fill the first empty waypoint input field
      const targetWp = updatedWps[emptyIndex];
      const updatedItem: Waypoint = {
        ...targetWp,
        lat,
        lng,
        name: initialName,
      };
      updatedWps[emptyIndex] = updatedItem;
      setWaypoints([...updatedWps]);

      // Fetch place name in background
      const realName = await reverseGeocode(lat, lng);
      setWaypoints((prev) =>
        prev.map((item, idx) => (idx === emptyIndex ? { ...item, name: realName } : item))
      );
      updatedWps[emptyIndex] = { ...updatedItem, name: realName };
    } else {
      // All current waypoints are filled -> Insert a new via point before destination
      const newWp: Waypoint = {
        id: `wp_map_${Date.now()}`,
        name: initialName,
        lat,
        lng,
      };
      if (updatedWps.length >= 2) {
        const insertIndex = updatedWps.length - 1;
        updatedWps.splice(insertIndex, 0, newWp);
      } else {
        updatedWps.push(newWp);
      }
      setWaypoints([...updatedWps]);

      // Fetch place name in background
      const realName = await reverseGeocode(lat, lng);
      setWaypoints((prev) =>
        prev.map((item) => (item.id === newWp.id ? { ...item, name: realName } : item))
      );
      updatedWps = updatedWps.map((item) => (item.id === newWp.id ? { ...item, name: realName } : item));
    }

    // Auto-calculate route if at least 2 waypoints have valid coordinates
    const validCount = updatedWps.filter((wp) => wp.lat !== 0 || wp.lng !== 0).length;
    if (validCount >= 2) {
      calculateRoute(updatedWps, profile, avoidHighways);
    }
  };

  // Clear route back to 2 clean empty input fields
  const handleClearWaypoints = () => {
    setWaypoints([
      { id: `wp_start_${Date.now()}`, name: '', lat: 0, lng: 0 },
      { id: `wp_end_${Date.now()}`, name: '', lat: 0, lng: 0 },
    ]);
    setPolyline([]);
    setElevationPoints([]);
    setSummary(undefined);
    setWeatherPoints([]);
    setErrorMessage(null);
  };

  // Convert current route to a round trip ending at start location
  const handleMakeRoundTrip = () => {
    const validWps = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (validWps.length === 0) {
      alert('Vennligst oppgi et startsted i kartet eller søkefeltet først for å lage en rundtur.');
      return;
    }

    const startWp = validWps[0];
    const endWpName = startWp.name ? `${startWp.name} (Retur)` : 'Startsted (Retur)';

    // Check if the route already ends at the start location
    const lastValid = validWps[validWps.length - 1];
    if (
      validWps.length > 1 &&
      Math.abs(lastValid.lat - startWp.lat) < 0.0001 &&
      Math.abs(lastValid.lng - startWp.lng) < 0.0001
    ) {
      alert('Ruten slutter allerede på samme sted som den startet (rundtur).');
      return;
    }

    const endWp: Waypoint = {
      id: `wp_round_${Date.now()}`,
      name: endWpName,
      lat: startWp.lat,
      lng: startWp.lng,
    };

    let updated: Waypoint[] = [];
    const lastIndex = waypoints.length - 1;

    // If the last waypoint input in the form is empty, replace it with the retur point
    if (lastIndex > 0 && waypoints[lastIndex].lat === 0 && waypoints[lastIndex].lng === 0) {
      updated = waypoints.map((wp, idx) => (idx === lastIndex ? endWp : wp));
    } else {
      updated = [...waypoints, endWp];
    }

    setWaypoints(updated);

    const validCount = updated.filter((wp) => wp.lat !== 0 || wp.lng !== 0).length;
    if (validCount >= 2) {
      calculateRoute(updated, profile, avoidHighways);
    }
  };

  // Trigger GPS Geolocation and suggest closest preset MC routes
  const handleSuggestNearby = () => {
    if (!navigator.geolocation) {
      alert('Geolokasjon støttes ikke i denne nettleseren.');
      return;
    }

    setIsSuggestingLocation(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const uLat = pos.coords.latitude;
        const uLng = pos.coords.longitude;
        setUserCoords({ lat: uLat, lng: uLng });

        // Calculate distance to starting waypoint of each curated route
        const sorted = PRESET_ROUTES.map((preset) => {
          const startWp = preset.waypoints[0];
          const dist = haversineDistance(uLat, uLng, startWp.lat, startWp.lng);
          return { preset, distanceKm: Math.round(dist) };
        }).sort((a, b) => a.distanceKm - b.distanceKm);

        setNearbySuggestions(sorted);
        setIsSuggestingLocation(false);
        setIsNearbyModalOpen(true);
      },
      (err) => {
        setIsSuggestingLocation(false);
        alert('Kunne ikke hente posisjon: ' + err.message + '. Vennligst tillat stedsgang i nettleseren.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Handle selecting a suggested nearby route
  const handleSelectNearbyRoute = (preset: PresetRoute, setStartToUserPos: boolean) => {
    setIsNearbyModalOpen(false);

    let newWps: Waypoint[] = [];
    if (setStartToUserPos && userCoords) {
      const userStartWp: Waypoint = {
        id: `wp_user_${Date.now()}`,
        name: 'Min Posisjon 📍',
        lat: userCoords.lat,
        lng: userCoords.lng,
      };
      const restWps: Waypoint[] = preset.waypoints.slice(1).map((wp, idx) => ({
        id: `preset_wp_${idx}_${Date.now()}`,
        name: wp.name,
        lat: wp.lat,
        lng: wp.lng,
      }));
      newWps = [userStartWp, ...restWps];
    } else {
      newWps = preset.waypoints.map((wp, idx) => ({
        id: `preset_wp_${idx}_${Date.now()}`,
        name: wp.name,
        lat: wp.lat,
        lng: wp.lng,
      }));
    }

    setWaypoints(newWps);
    setProfile('curvy');
    setAvoidHighways(true);
    calculateRoute(newWps, 'curvy', true);
  };

  // Fetch Vegvesen mountain passes & hazards
  const fetchHazards = async () => {
    try {
      const res = await fetch('/api/hazards');
      if (res.ok) {
        const data = await res.json();
        setHazards(data.hazards || []);
      }
    } catch (err) {
      console.warn('Failed to load hazards:', err);
    }
  };

  // Main Route Calculation Function
  const calculateRoute = async (
    currentWaypoints: Waypoint[],
    currentProfile: RouteProfile,
    currentAvoidHighways: boolean = avoidHighways
  ) => {
    // Filter out unfilled waypoints (lat=0, lng=0)
    const validWps = (currentWaypoints || []).filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (validWps.length < 2) return;

    setIsLoadingRoute(true);
    setErrorMessage(null);

    try {
      const coordinates: [number, number][] = validWps.map((wp) => [wp.lng, wp.lat]);

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coordinates,
          profile: currentProfile,
          avoidHighways: currentAvoidHighways,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Ruteberegning feilet');
      }

      const data = await res.json();
      setPolyline(data.polyline || []);
      setElevationPoints(data.elevationPoints || []);
      setSummary(data.summary);

      // Fetch weather forecast along 3-5 checkpoints of the calculated polyline
      if (data.polyline && data.polyline.length > 0) {
        fetchWeatherForPolyline(data.polyline, validWps);
      }
    } catch (err: any) {
      console.error('Calculate route error:', err);
      setErrorMessage(err.message || 'Kunne ikke beregne MC-rute.');
    } finally {
      setIsLoadingRoute(false);
    }
  };

  // Fetch MET.no weather forecast along route checkpoints
  const fetchWeatherForPolyline = async (line: [number, number][], wps: Waypoint[]) => {
    setIsLoadingWeather(true);
    try {
      // Pick 3-5 sample points along the route
      const checkPoints: { lat: number; lng: number; label: string }[] = [];

      // Start point
      checkPoints.push({
        lat: wps[0].lat,
        lng: wps[0].lng,
        label: wps[0].name,
      });

      // Mid points
      if (wps.length > 2) {
        const midWp = wps[Math.floor(wps.length / 2)];
        checkPoints.push({ lat: midWp.lat, lng: midWp.lng, label: midWp.name });
      } else if (line.length > 10) {
        const midIdx = Math.floor(line.length / 2);
        checkPoints.push({ lat: line[midIdx][0], lng: line[midIdx][1], label: 'Midtveis' });
      }

      // End point
      const lastWp = wps[wps.length - 1];
      checkPoints.push({
        lat: lastWp.lat,
        lng: lastWp.lng,
        label: lastWp.name,
      });

      const res = await fetch('/api/weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: checkPoints }),
      });

      if (res.ok) {
        const wxData = await res.json();
        setWeatherPoints(wxData.weather || []);
      }
    } catch (err) {
      console.warn('Weather fetch error:', err);
    } finally {
      setIsLoadingWeather(false);
    }
  };

  // Save tour to Dexie IndexedDB
  const handleSaveTour = async (title: string, notes: string) => {
    if (!summary) return;
    const tour: SavedTour = {
      id: `tour_${Date.now()}`,
      title,
      notes,
      createdAt: new Date().toISOString(),
      waypoints,
      profile,
      avoidHighways,
      distanceKm: summary.distanceKm,
      durationMin: summary.durationMin,
      elevationGainM: summary.elevationGainM,
      maxElevationM: summary.maxElevationM,
    };
    await db.tours.add(tour);
  };

  // Load tour from Dexie IndexedDB
  const handleLoadTour = (tour: SavedTour) => {
    setWaypoints(tour.waypoints);
    setProfile(tour.profile);
    const avoid = tour.avoidHighways ?? (tour.profile !== 'fastest');
    setAvoidHighways(avoid);
    calculateRoute(tour.waypoints, tour.profile, avoid);
    setIsSavedOpen(false);
  };

  // Delete tour from Dexie IndexedDB
  const handleDeleteTour = async (id: string) => {
    await db.tours.delete(id);
  };

  // Select Preset Norwegian Scenic Route
  const handleSelectPreset = (preset: PresetRoute) => {
    const newWaypoints: Waypoint[] = preset.waypoints.map((wp, idx) => ({
      id: `preset_wp_${idx}_${Date.now()}`,
      name: wp.name,
      lat: wp.lat,
      lng: wp.lng,
    }));

    setWaypoints(newWaypoints);
    setProfile('curvy');
    setAvoidHighways(true);
    calculateRoute(newWaypoints, 'curvy', true);
    setIsPresetsOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F4EF] text-[#2D332A] flex flex-col font-sans selection:bg-[#A7C957] selection:text-[#2D332A]">
      {/* Header Bar */}
      <Header
        onOpenPresets={() => setIsPresetsOpen(true)}
        onOpenSavedTours={() => setIsSavedOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        savedToursCount={savedTours.length}
        hasRoute={polyline.length > 0}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        {/* Mountain Pass Warnings Banner (Vises kun når rute er valgt/beregnet) */}
        {polyline.length > 0 && <HazardBanner hazards={hazards} />}

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-[#BC4749] border border-[#8B3436] text-white p-4 rounded-2xl flex items-center justify-between gap-3 text-sm shadow-md">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-white shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-xs font-bold px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white transition"
            >
              Lukk
            </button>
          </div>
        )}

        {/* Primary Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Route Editor Controls (4 cols on lg) */}
          <div className="lg:col-span-4 space-y-4">
            <RouteEditor
              waypoints={waypoints}
              setWaypoints={setWaypoints}
              profile={profile}
              setProfile={handleSetProfile}
              avoidHighways={avoidHighways}
              setAvoidHighways={setAvoidHighways}
              onCalculateRoute={() => calculateRoute(waypoints, profile, avoidHighways)}
              onClearWaypoints={handleClearWaypoints}
              onMakeRoundTrip={handleMakeRoundTrip}
              onSuggestNearby={handleSuggestNearby}
              isSuggestingLocation={isSuggestingLocation}
              isLoading={isLoadingRoute}
            />
          </div>

          {/* Right Column: Interactive Map & Elevation Profile (8 cols on lg) */}
          <div className="lg:col-span-8 space-y-4 flex flex-col">
            {/* Interactive Leaflet Map */}
            <div className="h-[420px] sm:h-[480px] w-full">
              <MapView
                polyline={polyline}
                waypoints={waypoints}
                weatherPoints={weatherPoints}
                hazards={hazards}
                onMapClick={handleMapClick}
              />
            </div>

            {/* Weather Checkpoints Widget */}
            <WeatherWidget weatherPoints={weatherPoints} isLoading={isLoadingWeather} />

            {/* Height Elevation Profile Chart */}
            <ElevationChart summary={summary} elevationPoints={elevationPoints} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#E0E0D6] text-xs text-[#6B705C] py-4 px-5 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p>© 2026 Sving.no — Norsk MC-turplanlegger for svingete veier.</p>
          <p className="text-[11px] text-[#6B705C]">
            Kart fra OpenStreetMap & Kartverket. Vær fra MET.no WeatherAPI. Ingen registrering eller sporing.
          </p>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        waypoints={waypoints}
        polyline={polyline}
        elevationPoints={elevationPoints}
        summary={summary}
        profile={profile}
        onSaveTour={handleSaveTour}
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
        onSelectPreset={handleSelectPreset}
      />

      <NearbyRouteModal
        isOpen={isNearbyModalOpen}
        onClose={() => setIsNearbyModalOpen(false)}
        suggestions={nearbySuggestions}
        userCoords={userCoords}
        onSelectRoute={handleSelectNearbyRoute}
      />
    </div>
  );
}
