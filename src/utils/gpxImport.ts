import { haversineDistance, isValidCoord } from './geo';

/**
 * Reads a GPX file into route points.
 *
 * Deliberately not DOMParser: every other test in this project is pure logic
 * running in node, and a parser that only works in a browser is a parser that
 * only gets tested by hand. GPX's point elements are a narrow, well-specified
 * shape — `<trkpt lat lon>`, `<rtept lat lon>`, `<wpt lat lon>`, each with an
 * optional `<name>` — and reading exactly those is something a focused pattern
 * does correctly in both places. Anything wider than that belongs in a real
 * parser, and this deliberately stays narrower.
 */

export type GpxSource = 'route' | 'track' | 'waypoints';

export interface ImportedPoint {
  name: string;
  lat: number;
  lng: number;
}

export interface ImportedRoute {
  points: ImportedPoint[];
  /** Which part of the file the points came from. */
  source: GpxSource;
  /** How many points that part held before thinning. */
  originalCount: number;
}

export class GpxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GpxImportError';
  }
}

/** Optional namespace prefix: plenty of exporters write `<gpx:trkpt>`. */
const tagPattern = (tag: string): RegExp =>
  new RegExp(`<(?:\\w+:)?${tag}\\b([^>]*?)(/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`, 'gi');

const attribute = (attributes: string, name: string): number | null => {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attributes);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
};

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function nameInside(body: string | undefined): string {
  if (!body) return '';
  const match = /<(?:\w+:)?name\b[^>]*>([\s\S]*?)<\/(?:\w+:)?name>/i.exec(body);
  return match ? decodeXml(match[1]) : '';
}

function pointsOf(xml: string, tag: string): ImportedPoint[] {
  const points: ImportedPoint[] = [];

  for (const match of xml.matchAll(tagPattern(tag))) {
    const lat = attribute(match[1], 'lat');
    const lng = attribute(match[1], 'lon');
    if (lat === null || lng === null || !isValidCoord(lat, lng)) continue;

    points.push({ name: nameInside(match[3]), lat, lng });
  }

  return points;
}

/**
 * Thins a list down to `limit` points, spaced evenly by distance rather than by
 * index. A recorded track has its points bunched wherever the rider went slowly
 * — through exactly the hairpins that matter — so picking every nth point would
 * spend the whole budget on one pass and skip a hundred kilometres of valley.
 *
 * The first and last points always survive: they are the start and the finish.
 */
export function thinToLimit(points: ImportedPoint[], limit: number): ImportedPoint[] {
  if (points.length <= limit || limit < 2) return points.slice(0, Math.max(limit, 0));

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(
      cumulative[i - 1] +
        haversineDistance(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
    );
  }

  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [points[0], points[points.length - 1]];

  const picked: ImportedPoint[] = [points[0]];

  for (let step = 1; step < limit - 1; step++) {
    const target = (total * step) / (limit - 1);
    let index = cumulative.findIndex((distance) => distance >= target);
    if (index <= 0) index = 1;
    if (index >= points.length - 1) index = points.length - 2;
    if (picked[picked.length - 1] !== points[index]) picked.push(points[index]);
  }

  picked.push(points[points.length - 1]);
  return picked;
}

/** Files this app wrote carry their planned waypoints in `<wpt>`, names and all. */
const isOwnExport = (xml: string): boolean => /creator\s*=\s*["'][^"']*Sving/i.test(xml);

/**
 * Which part of the file describes the ride.
 *
 * A `<rte>` is a planned route and says so. Otherwise a `<trk>` is the truth:
 * it is the path actually ridden or drawn, and `<wpt>` in the same file is
 * usually a scattering of points of interest, which would make a nonsense route
 * if mistaken for one. Files this app wrote are the exception — there `<wpt>` is
 * exactly the planned waypoints, and reading them back restores the route the
 * rider built rather than an approximation of the line it drew.
 */
function selectPoints(xml: string): { points: ImportedPoint[]; source: GpxSource } {
  const routePoints = pointsOf(xml, 'rtept');
  if (routePoints.length >= 2) return { points: routePoints, source: 'route' };

  const waypoints = pointsOf(xml, 'wpt');
  if (isOwnExport(xml) && waypoints.length >= 2) {
    return { points: waypoints, source: 'waypoints' };
  }

  const trackPoints = pointsOf(xml, 'trkpt');
  if (trackPoints.length >= 2) return { points: trackPoints, source: 'track' };

  if (waypoints.length >= 2) return { points: waypoints, source: 'waypoints' };

  return { points: [], source: 'track' };
}

export function parseGpx(xml: string, limit: number): ImportedRoute {
  if (!/<(?:\w+:)?gpx\b/i.test(xml)) {
    throw new GpxImportError('Dette ser ikke ut som en GPX-fil.');
  }

  const { points, source } = selectPoints(xml);

  if (points.length < 2) {
    throw new GpxImportError('Fant ingen rute i GPX-fila — den må ha minst to punkter.');
  }

  return { points: thinToLimit(points, limit), source, originalCount: points.length };
}
