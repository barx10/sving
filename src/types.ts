export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isCustom?: boolean;
}

/**
 * 'scenic' was a third style until it turned out to be 'curvy' under another
 * name. Links and saved tours from then are normalised on the way in — see
 * utils/routeProfile.
 */
export type RouteProfile = 'curvy' | 'fastest';

export interface RouteSummary {
  distanceKm: number;
  durationMin: number;
  /** Null when no elevation provider was reachable. Never a fabricated value. */
  elevationGainM: number | null;
  elevationLossM: number | null;
  maxElevationM: number | null;
  /** Degrees of heading change per kilometre — how twisty the route actually is. */
  curvatureDegPerKm: number;
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  lat: number;
  lng: number;
}

/** A crossing the rider has to catch, queue for and pay for. */
export interface FerryCrossing {
  /** The crossing as OSM names it, e.g. "Sølsnes - Åfarnes". */
  name: string;
  /** How far into the route the quay is. */
  distanceKm: number;
  /** Sailing time. Waiting for the boat is not something any router knows. */
  crossingMin: number;
}

/** One line on the cue sheet: how far in, what to do, and which road it puts you on. */
export interface RouteStep {
  /** Distance from the start of the route to this manoeuvre. */
  distanceKm: number;
  /** Norwegian, written by us — neither engine speaks it. */
  instruction: string;
  /** Null where OSM leaves the road unnamed, which is common on Norwegian side roads. */
  roadName: string | null;
  /** A ferry leg is not a road: it has a timetable, a queue and a fare. */
  isFerry: boolean;
  lat: number;
  lng: number;
}

export interface RouteSources {
  routing: string;
  elevation: string | null;
}

export interface RouteResult {
  polyline: [number, number][];
  distanceKm: number;
  durationMin: number;
  elevationPoints: ElevationPoint[];
  /** Empty when the engine gave no usable instructions — never a fabricated cue. */
  steps: RouteStep[];
  ferries: FerryCrossing[];
  /**
   * Whether the riding style actually got to choose. False means the engine
   * offered one road and the style shaped nothing — which the planner says
   * outright rather than implying the route was picked for the rider.
   */
  rankedAlternatives: boolean;
  /**
   * 'unknown' when the engine could not say where ferries are. An empty list
   * then means we were not told, not that the route stays on land.
   */
  ferryStatus: 'known' | 'unknown';
  summary: RouteSummary;
  sources: RouteSources;
  notes: string[];
}

export type RidingCondition = 'good' | 'fair' | 'poor';

export interface Forecast {
  /** The forecast hour actually used, which may differ from the one requested. */
  time: string;
  requestedTime: string;
  /** True when the nearest available forecast hour was more than three hours off. */
  approximate: boolean;
  tempC: number | null;
  windSpeedMs: number | null;
  windGustMs: number | null;
  precipitationMm: number | null;
  symbolCode: string | null;
  condition: RidingCondition;
  conditionLabel: string;
}

export interface WeatherCheckpoint {
  lat: number;
  lng: number;
  locationName: string;
  /** Null when MET.no could not be reached — the UI must say so, not guess. */
  forecast: Forecast | null;
  error: string | null;
}

export type PassStatus = 'open' | 'closed_seasonal' | 'uncertain';

export interface MountainPassStatus {
  id: string;
  name: string;
  road: string;
  description: string;
  lat: number;
  lng: number;
  summitM?: number;
  note?: string;
  status: PassStatus;
  statusLabel: string;
  statusDetail: string;
}

export interface HazardReport {
  passes: MountainPassStatus[];
  dataSource: string;
  disclaimer: string;
  verifyUrl: string;
  generatedAt: string;
}

export type PoiCategory = 'fuel' | 'rest_area';

/**
 * A fuel station or rest area beside the route, from OpenStreetMap. Unlike the
 * mountain passes this is live data, so a place that closed stops appearing.
 */
export interface PointOfInterest {
  id: string;
  category: PoiCategory;
  name: string;
  lat: number;
  lng: number;
  brand?: string;
  openingHours?: string;
  hasToilets?: boolean;
  /** How far along the route it sits, in kilometres. Worked out client-side. */
  distanceAlongKm?: number;
  /** Detour from the road itself, in kilometres. */
  detourKm?: number;
}

export interface SavedTour {
  id: string;
  title: string;
  notes?: string;
  createdAt: string;
  waypoints: Waypoint[];
  profile: RouteProfile;
  avoidHighways?: boolean;
  distanceKm: number;
  durationMin: number;
  elevationGainM?: number | null;
  maxElevationM?: number | null;
}

export interface PresetRoute {
  id: string;
  title: string;
  region: string;
  description: string;
  distanceKm: number;
  estimatedHours: number;
  highlights: string[];
  waypoints: { name: string; lat: number; lng: number }[];
}

/** A non-blocking message shown in the app instead of a native alert(). */
export interface Notice {
  id: string;
  tone: 'error' | 'info';
  message: string;
}
