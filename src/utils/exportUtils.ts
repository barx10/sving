import type { ElevationPoint, Waypoint } from '../types';
import { cumulativeDistancesKm, hasCoords } from './geo';

/** Google Maps accepts an origin, a destination and up to eight waypoints. */
const GOOGLE_MAX_POINTS = 7;
const APPLE_MAX_POINTS = 5;

function escapeXml(value: string | undefined | null): string {
  return String(value ?? '').replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      default: return '&quot;';
    }
  });
}

/**
 * Elevation for every polyline point, interpolated from the sampled profile.
 *
 * Both arrays are ordered along the route, so this walks them together instead
 * of searching the whole profile for each of several thousand track points.
 * Returns null when there is no elevation data — the GPX then omits <ele>
 * rather than writing a made-up 100 m for every point, which is what a device
 * would otherwise display as a completely flat ride.
 */
function buildElevationLookup(
  polyline: [number, number][],
  elevationPoints: ElevationPoint[]
): ((index: number) => number) | null {
  if (elevationPoints.length === 0) return null;

  const distances = cumulativeDistancesKm(polyline);
  let cursor = 0;

  return (index: number): number => {
    const distance = distances[index];
    while (cursor < elevationPoints.length - 2 && elevationPoints[cursor + 1].distanceKm < distance) {
      cursor++;
    }

    const current = elevationPoints[cursor];
    const next = elevationPoints[cursor + 1];
    if (!next) return current.elevationM;

    const span = next.distanceKm - current.distanceKm;
    if (span <= 0) return current.elevationM;

    const ratio = Math.min(1, Math.max(0, (distance - current.distanceKm) / span));
    return Math.round(current.elevationM + (next.elevationM - current.elevationM) * ratio);
  };
}

/** Builds a GPX 1.1 document for the route and hands it to the browser as a download. */
export function downloadGpxFile(
  tourTitle: string,
  polyline: [number, number][],
  elevationPoints: ElevationPoint[],
  waypoints: Waypoint[]
): void {
  const title = tourTitle || 'MC-tur';
  const safeName = title.replace(/[^a-zA-Z0-9æøåÆØÅ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'MC_tur';
  const elevationAt = buildElevationLookup(polyline, elevationPoints);

  const trackPoints = polyline
    .map(([lat, lng], index) => {
      const elevation = elevationAt ? `\n        <ele>${elevationAt(index)}</ele>` : '';
      return `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">${elevation}\n      </trkpt>`;
    })
    .join('\n');

  const placed = waypoints.filter(hasCoords);
  const waypointXml = placed
    .map((wp, index) => {
      const symbol = index === 0 ? 'Flag, Green' : index === placed.length - 1 ? 'Flag, Red' : 'Pin, Blue';
      return (
        `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}">\n` +
        `    <name>${escapeXml(wp.name)}</name>\n` +
        `    <sym>${symbol}</sym>\n` +
        '  </wpt>'
      );
    })
    .join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Sving - norsk MC-turplanlegger" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(title)}</name>
    <desc>Generert med Sving</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypointXml}
  <trk>
    <name>${escapeXml(title)}</name>
    <type>MOTORCYCLING</type>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;

  const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Picks the handful of intermediate points that best pin a consumer navigation
 * app to the scenic route rather than its own idea of the fastest way.
 *
 * Sharp direction changes are the useful ones: they are where a routing engine
 * would otherwise take a different road entirely.
 */
export function reduceWaypointsForMaps(
  polyline: [number, number][],
  userWaypoints: Waypoint[],
  maxWaypoints: number = GOOGLE_MAX_POINTS
): [number, number][] {
  const placed = userWaypoints.filter(hasCoords);

  if (polyline.length === 0) return placed.map((w) => [w.lat, w.lng]);
  if (polyline.length <= maxWaypoints + 2) return polyline;

  const lastIndex = polyline.length - 1;
  // Both ends are always kept; the budget below is for the points in between.
  const selected = new Set<number>([0, lastIndex]);

  // The rider's own via points matter more than any curve we detect.
  for (const waypoint of placed) {
    let closest = 0;
    let closestDistance = Infinity;
    for (let i = 0; i < polyline.length; i++) {
      const distance = Math.hypot(polyline[i][0] - waypoint.lat, polyline[i][1] - waypoint.lng);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    }
    if (selected.size < maxWaypoints + 2) selected.add(closest);
  }

  const candidates: { index: number; score: number }[] = [];
  for (let i = 2; i < lastIndex - 1; i += 2) {
    const previous = polyline[i - 2];
    const current = polyline[i];
    const next = polyline[i + 2];

    const incoming = Math.atan2(current[0] - previous[0], current[1] - previous[1]);
    const outgoing = Math.atan2(next[0] - current[0], next[1] - current[1]);
    let turn = Math.abs(outgoing - incoming);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;

    candidates.push({ index: i, score: turn });
  }
  candidates.sort((a, b) => b.score - a.score);

  const minSpacing = polyline.length / (maxWaypoints + 2);
  for (const candidate of candidates) {
    if (selected.size >= maxWaypoints + 2) break;
    const tooClose = Array.from(selected).some((index) => Math.abs(index - candidate.index) < minSpacing);
    if (!tooClose) selected.add(candidate.index);
  }

  return Array.from(selected)
    .sort((a, b) => a - b)
    .map((index) => polyline[index]);
}

const formatCoord = ([lat, lng]: [number, number]): string => `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function buildGoogleMapsUrl(polyline: [number, number][], userWaypoints: Waypoint[]): string {
  const points = reduceWaypointsForMaps(polyline, userWaypoints, GOOGLE_MAX_POINTS);
  if (points.length < 2) return 'https://www.google.com/maps';

  const origin = formatCoord(points[0]);
  const destination = formatCoord(points[points.length - 1]);
  const via = points.slice(1, -1).map(formatCoord).join('|');

  const url =
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    '&travelmode=driving';

  return via ? `${url}&waypoints=${encodeURIComponent(via)}` : url;
}

export function buildAppleMapsUrl(polyline: [number, number][], userWaypoints: Waypoint[]): string {
  const points = reduceWaypointsForMaps(polyline, userWaypoints, APPLE_MAX_POINTS);
  if (points.length < 2) return 'https://maps.apple.com';

  const saddr = formatCoord(points[0]);
  const daddr = formatCoord(points[points.length - 1]);

  return `https://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=d`;
}
