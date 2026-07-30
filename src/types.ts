export interface Waypoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isCustom?: boolean;
}

export type RouteProfile = 'curvy' | 'scenic' | 'fastest';

export interface RouteSummary {
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  elevationLossM: number;
  maxElevationM: number;
}

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
  lat: number;
  lng: number;
}

export interface WeatherPoint {
  lat: number;
  lng: number;
  locationName: string;
  temp: number;
  symbolCode: string;
  windSpeed: number;
  precipitation: number;
  time: string;
}

export interface RoadHazard {
  id: string;
  name: string;
  type: 'mountain_pass' | 'construction' | 'closure' | 'weather_alert';
  status: 'closed' | 'open' | 'restricted' | 'warning';
  description: string;
  lat: number;
  lng: number;
  updated: string;
  isSeasonal?: boolean;
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
  elevationGainM: number;
  maxElevationM?: number;
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
