export const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => deg * (Math.PI / 180);

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Total length of a [lat, lng] polyline, in kilometres. */
export function polylineLengthKm(line: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += haversineDistance(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
  }
  return total;
}

/**
 * Cumulative distance from the start of the polyline to each of its points.
 * Returns an array the same length as `line`, starting at 0.
 */
export function cumulativeDistancesKm(line: [number, number][]): number[] {
  const out: number[] = new Array(line.length);
  let running = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      running += haversineDistance(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]);
    }
    out[i] = running;
  }
  return out;
}

/**
 * A waypoint only counts as placed once the user has given it real coordinates.
 * Empty rows in the route editor carry (0, 0), which is a valid coordinate in
 * the Gulf of Guinea but never a valid one for a Norwegian motorcycle tour.
 */
export function hasCoords(point: { lat: number; lng: number }): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    !(point.lat === 0 && point.lng === 0)
  );
}

/** Rejects coordinates that are out of range or not finite. */
export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

/**
 * Sinuosity: how much longer the road is than the straight line between its
 * endpoints. 1.0 is a ruler-straight road; Trollstigen sits well above 2.
 * Used to rank candidate routes when the rider asks for curvy roads.
 */
export function sinuosity(line: [number, number][]): number {
  if (line.length < 2) return 1;
  const straight = haversineDistance(line[0][0], line[0][1], line[line.length - 1][0], line[line.length - 1][1]);
  if (straight < 0.01) return 1;
  return polylineLengthKm(line) / straight;
}

/**
 * Total absolute heading change along the polyline, in degrees per kilometre.
 * This is the honest measure of "svingete" — a long detour on a straight road
 * scores low, while a short pass full of hairpins scores high.
 */
export function curvatureDegPerKm(line: [number, number][]): number {
  if (line.length < 3) return 0;

  let totalTurn = 0;
  let prevBearing: number | null = null;

  for (let i = 1; i < line.length; i++) {
    const bearing = Math.atan2(line[i][1] - line[i - 1][1], line[i][0] - line[i - 1][0]) * (180 / Math.PI);
    if (prevBearing !== null) {
      let diff = Math.abs(bearing - prevBearing);
      if (diff > 180) diff = 360 - diff;
      totalTurn += diff;
    }
    prevBearing = bearing;
  }

  const lengthKm = polylineLengthKm(line);
  return lengthKm > 0 ? totalTurn / lengthKm : 0;
}
