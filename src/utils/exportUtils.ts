import type { Waypoint } from '../types';

/**
 * Generates a standard GPX 1.1 XML string from route polyline and elevation points,
 * then triggers a browser download of the .gpx file.
 */
export function downloadGpxFile(
  tourTitle: string,
  polyline: [number, number][], // [lat, lng]
  elevationPoints: { distanceKm: number; elevationM: number; lat: number; lng: number }[],
  waypoints: Waypoint[]
) {
  const safeName = (tourTitle || 'MC_Tur').replace(/[^a-zA-Z0-9_-]/g, '_');
  const nowIso = new Date().toISOString();

  // Create lookup for elevation by closest lat/lng index
  let trkptsXml = '';
  for (let i = 0; i < polyline.length; i++) {
    const [lat, lng] = polyline[i];
    
    // Find closest elevation point if available
    let ele = 100;
    if (elevationPoints && elevationPoints.length > 0) {
      const closest = elevationPoints.reduce((prev, curr) => {
        const d1 = Math.hypot(prev.lat - lat, prev.lng - lng);
        const d2 = Math.hypot(curr.lat - lat, curr.lng - lng);
        return d2 < d1 ? curr : prev;
      });
      ele = closest.elevationM;
    }

    trkptsXml += `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}">\n`;
    trkptsXml += `        <ele>${ele}</ele>\n`;
    trkptsXml += `      </trkpt>\n`;
  }

  // Waypoints XML (Start, End, Via)
  let wptXml = '';
  waypoints.forEach((wpt, idx) => {
    const sym = idx === 0 ? 'Flag, Green' : idx === waypoints.length - 1 ? 'Flag, Red' : 'Pin, Blue';
    wptXml += `  <wpt lat="${wpt.lat.toFixed(6)}" lon="${wpt.lng.toFixed(6)}">\n`;
    wptXml += `    <name>${escapeXml(wpt.name)}</name>\n`;
    wptXml += `    <sym>${sym}</sym>\n`;
    wptXml += `  </wpt>\n`;
  });

  const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Svingy - Norsk MC-turplanlegger" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(tourTitle)}</name>
    <desc>Generert med Svingy Norsk MC-turplanlegger</desc>
    <time>${nowIso}</time>
  </metadata>
${wptXml}  <trk>
    <name>${escapeXml(tourTitle)}</name>
    <type>MOTORCYCLING</type>
    <trkseg>
${trkptsXml}    </trkseg>
  </trk>
</gpx>`;

  const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Smart Waypoint Reduction:
 * Google Maps allows ~9 points (origin, destination + 8 waypoints).
 * This function samples critical direction changes & milestone points along the detailed route polyline
 * so that opening in Google Maps or Apple Maps forces navigation along the scenic motorcycle route!
 */
export function reduceWaypointsForMaps(
  polyline: [number, number][], // [lat, lng]
  userWaypoints: Waypoint[],
  maxWaypoints: number = 7
): [number, number][] {
  if (!polyline || polyline.length === 0) {
    return userWaypoints.map((w) => [w.lat, w.lng]);
  }

  if (polyline.length <= maxWaypoints + 2) {
    return polyline;
  }

  // Always keep first (start) and last (end)
  const reduced: [number, number][] = [];
  reduced.push(polyline[0]);

  // Calculate direction turn angles along polyline
  const candidates: { index: number; score: number }[] = [];
  for (let i = 2; i < polyline.length - 2; i += 2) {
    const pPrev = polyline[i - 2];
    const pCurr = polyline[i];
    const pNext = polyline[i + 2];

    const anglePrev = Math.atan2(pCurr[0] - pPrev[0], pCurr[1] - pPrev[1]);
    const angleNext = Math.atan2(pNext[0] - pCurr[0], pNext[1] - pCurr[1]);
    let diff = Math.abs(angleNext - anglePrev);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    // Higher score for sharp turn/junction
    candidates.push({ index: i, score: diff });
  }

  // Sort candidates by turn sharpness / curve importance
  candidates.sort((a, b) => b.score - a.score);

  // Also include user-explicit waypoints
  const userIndexes: number[] = [];
  userWaypoints.forEach((w) => {
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < polyline.length; i++) {
      const d = Math.hypot(polyline[i][0] - w.lat, polyline[i][1] - w.lng);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    }
    userIndexes.push(closestIdx);
  });

  // Combine top curve points and user waypoints spaced along route
  const selectedIndicesSet = new Set<number>();
  userIndexes.forEach((idx) => selectedIndicesSet.add(idx));

  // Add top sharp curve points until we reach maxWaypoints
  for (const cand of candidates) {
    if (selectedIndicesSet.size >= maxWaypoints) break;
    // Ensure min distance between selected indices
    let tooClose = false;
    for (const selectedIdx of selectedIndicesSet) {
      if (Math.abs(selectedIdx - cand.index) < polyline.length / (maxWaypoints + 2)) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selectedIndicesSet.add(cand.index);
    }
  }

  // Sort selected indices along route order
  const sortedIndices = Array.from(selectedIndicesSet).sort((a, b) => a - b);
  sortedIndices.forEach((idx) => {
    reduced.push(polyline[idx]);
  });

  // End point
  reduced.push(polyline[polyline.length - 1]);

  return reduced;
}

/**
 * Builds Google Maps Deep Link URL
 */
export function buildGoogleMapsUrl(
  polyline: [number, number][],
  userWaypoints: Waypoint[]
): string {
  const points = reduceWaypointsForMaps(polyline, userWaypoints, 7);
  if (points.length < 2) return 'https://www.google.com/maps';

  const origin = `${points[0][0].toFixed(5)},${points[0][1].toFixed(5)}`;
  const destination = `${points[points.length - 1][0].toFixed(5)},${points[points.length - 1][1].toFixed(5)}`;

  const viaWaypoints = points.slice(1, -1).map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  if (viaWaypoints) {
    url += `&waypoints=${encodeURIComponent(viaWaypoints)}`;
  }

  return url;
}

/**
 * Builds Apple Maps Deep Link URL
 */
export function buildAppleMapsUrl(
  polyline: [number, number][],
  userWaypoints: Waypoint[]
): string {
  const points = reduceWaypointsForMaps(polyline, userWaypoints, 5);
  if (points.length < 2) return 'https://maps.apple.com';

  const saddr = `${points[0][0].toFixed(5)},${points[0][1].toFixed(5)}`;
  const daddr = `${points[points.length - 1][0].toFixed(5)},${points[points.length - 1][1].toFixed(5)}`;

  return `https://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=d`;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
