import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type ElevationPoint,
  type OrsFeature,
  type OsrmRoute,
  buildRouteResponseFromOrsFeature,
  elevationStats,
  avoidedFeatures,
  estimatedDurationMin,
  isRetryableRoundTripFailure,
  paceAdjustment,
  pickBestRoute,
  pickCurviestFeature,
  pickSampleIndices,
  wantsOrsAlternatives,
} from './route.js';
import { UpstreamError } from '../upstream.js';

/** Builds an OSRM-shaped candidate from a polyline given as [lat, lng] pairs. */
function candidate(
  line: [number, number][],
  distanceKm: number,
  highwaySteps: { name: string; km: number }[] = []
): OsrmRoute {
  return {
    distance: distanceKm * 1000,
    duration: distanceKm * 60,
    geometry: { coordinates: line.map(([lat, lng]) => [lng, lat] as [number, number]) },
    legs: [{ steps: highwaySteps.map((s) => ({ name: s.name, distance: s.km * 1000 })) }],
  };
}

const straightLine: [number, number][] = Array.from({ length: 40 }, (_, i) => [62 + i * 0.01, 7]);

const twistyLine: [number, number][] = Array.from({ length: 40 }, (_, i) => [
  62 + i * 0.002,
  7 + (i % 2) * 0.003,
]);

describe('pickBestRoute', () => {
  it('prefers the twisty road over a longer straight one', () => {
    // The original scoring used raw distance, which meant "curvy" really meant
    // "longest" — a long motorway detour beat a short mountain pass.
    const long = candidate(straightLine, 220);
    const twisty = candidate(twistyLine, 90);

    expect(pickBestRoute([long, twisty], 'curvy', true)).toBe(twisty);
  });

  it('penalises routes that spend distance on E-roads when avoiding motorways', () => {
    const viaMotorway = candidate(twistyLine, 100, [{ name: 'E6', km: 80 }]);
    const backRoads = candidate(twistyLine, 100, [{ name: 'Fylkesveg 63', km: 0 }]);

    expect(pickBestRoute([viaMotorway, backRoads], 'curvy', true)).toBe(backRoads);
  });

  it('takes OSRM’s first suggestion when the rider wants speed', () => {
    const fastest = candidate(straightLine, 200);
    const scenic = candidate(twistyLine, 90);

    expect(pickBestRoute([fastest, scenic], 'fastest', false)).toBe(fastest);
  });

  it('returns the only candidate when there are no alternatives', () => {
    const only = candidate(twistyLine, 90);
    expect(pickBestRoute([only], 'curvy', true)).toBe(only);
  });

  it('copes with candidates that carry no step data', () => {
    const withoutLegs: OsrmRoute = {
      distance: 90_000,
      duration: 5400,
      geometry: { coordinates: twistyLine.map(([lat, lng]) => [lng, lat] as [number, number]) },
    };
    expect(() => pickBestRoute([withoutLegs], 'curvy', true)).not.toThrow();
  });
});

/** Builds an ORS-shaped feature from a polyline given as [lat, lng] pairs. */
function feature(line: [number, number][], distanceKm: number): OrsFeature {
  return {
    geometry: { coordinates: line.map(([lat, lng]) => [lng, lat, 500]) },
    properties: { summary: { distance: distanceKm * 1000, duration: distanceKm * 60 } },
  };
}

describe('pickCurviestFeature', () => {
  it('picks the curviest of the alternatives ORS returns', () => {
    const straight = feature(straightLine, 220);
    const twisty = feature(twistyLine, 90);

    expect(pickCurviestFeature([straight, twisty], 'curvy', true)).toBe(twisty);
  });

  it('keeps ORS’s own first choice when the rider wants speed', () => {
    const fastest = feature(straightLine, 200);
    const twisty = feature(twistyLine, 90);

    expect(pickCurviestFeature([fastest, twisty], 'fastest', false)).toBe(fastest);
  });

  it('returns null when ORS found no route at all', () => {
    expect(pickCurviestFeature([], 'curvy', true)).toBeNull();
  });

  it('returns the single route when there are no alternatives', () => {
    const only = feature(twistyLine, 90);
    expect(pickCurviestFeature([only], 'curvy', true)).toBe(only);
  });
});

describe('OpenRouteService profile', () => {
  it('requests a profile that actually exists', () => {
    // OpenRouteService has no motorcycle profile — the valid set is
    // driving-car, driving-hgv, cycling-*, foot-* and wheelchair. Asking for
    // "driving-motorcycle" made every ORS request fail and fall back to OSRM
    // without anyone noticing, because the fallback is silent by design.
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const requested = [...source.matchAll(/v2\/directions\/([\w-]+)\//g)].map((m) => m[1]);

    expect(requested.length).toBeGreaterThan(0);
    for (const profile of requested) {
      expect([
        'driving-car',
        'driving-hgv',
        'cycling-regular',
        'cycling-road',
        'cycling-mountain',
        'cycling-electric',
        'foot-walking',
        'foot-hiking',
        'wheelchair',
      ]).toContain(profile);
    }
  });
});

describe('estimated duration', () => {
  it('slows a properly twisty road down from the car estimate', () => {
    // 250°/km is what a fjord-valley road over a pass actually measures.
    expect(estimatedDurationMin(60 * 60, 250)).toBe(72);
  });

  it('leaves a straight road at the engine estimate', () => {
    expect(estimatedDurationMin(60 * 60, 20)).toBe(60);
  });

  it('scales evenly in between rather than stepping', () => {
    expect(paceAdjustment(150)).toBeCloseTo(1.1, 5);
  });

  it('does not run away on a road twistier than anything it was calibrated on', () => {
    expect(paceAdjustment(2000)).toBe(paceAdjustment(250));
  });

  /**
   * Reported from a Rollag–Ringerike route: both styles returned the same road
   * and the same 206 km, but the time jumped by exactly the old style-based
   * factor of 1.2. The distance and the line on the map never moved, so the
   * difference was the button, not the ride. A road takes as long as it takes.
   */
  it('derives the estimate from the road it describes, not from a preference', () => {
    const feature: OrsFeature = {
      geometry: { coordinates: twistyLine.map(([lat, lng]) => [lng, lat]) },
      properties: { summary: { distance: 42_000, duration: 60 * 60 } },
    };

    // The builder no longer accepts a riding style at all, so the compiler
    // enforces the half of this that used to need saying. What is left to
    // check is that the number it does use is the road's own curvature —
    // and that the ORS path applies it, which it once skipped entirely,
    // reporting the same tour twenty percent quicker wherever a routing key
    // happened to be configured.
    const built = buildRouteResponseFromOrsFeature(feature);

    expect(built.durationMin).toBe(estimatedDurationMin(60 * 60, built.summary.curvatureDegPerKm));
    expect(built.summary.durationMin).toBe(built.durationMin);
  });
});

describe('wantsOrsAlternatives', () => {
  // Trollstigen -> Valldal, well under ORS's alternative-routes distance cap.
  const nearby: [number, number][] = [
    [7.687, 62.567],
    [7.25, 62.3],
  ];
  // Oslo -> Bergen straight line is ~305 km. ORS's public API rejects
  // alternative_routes with a 400 above 100 km of road distance, and the road
  // distance for a request like this is always well past that on this corridor
  // — exactly the long-haul routes the app is meant to help plan.
  const osloBergen: [number, number][] = [
    [10.7522, 59.9139],
    [5.3221, 60.3913],
  ];

  it('wants alternatives for a short curvy route', () => {
    expect(wantsOrsAlternatives(nearby, 'curvy')).toBe(true);
  });

  it('skips alternatives for a route ORS would reject as too long', () => {
    expect(wantsOrsAlternatives(osloBergen, 'curvy')).toBe(false);
  });

  it('skips alternatives when the rider wants the fastest route regardless of distance', () => {
    expect(wantsOrsAlternatives(nearby, 'fastest')).toBe(false);
  });

  it('skips alternatives for a route with via-points', () => {
    expect(wantsOrsAlternatives([...nearby, [7.0, 62.1]], 'curvy')).toBe(false);
  });
});

describe('isRetryableRoundTripFailure', () => {
  // Observed against the real API from Åndalsnes, a narrow fjord-valley road
  // network: ORS's round_trip algorithm is randomised and genuinely fails
  // about half the time there with a bare 500, distinct from a real problem.
  it('retries a bare ORS 500', () => {
    expect(isRetryableRoundTripFailure(new UpstreamError('OpenRouteService', 'svarte 500', 500))).toBe(
      true
    );
  });

  // Seen twice in production for this exact hardcoded, always-valid URL —
  // since the path never varies, a 404 here can only be a transient blip on
  // ORS's own infrastructure, never a real "this endpoint doesn't exist".
  it('retries a 404 from ORS, since the requested path never changes', () => {
    expect(isRetryableRoundTripFailure(new UpstreamError('OpenRouteService', 'svarte 404', 404))).toBe(
      true
    );
  });

  it('does not retry an auth failure — a fresh seed will not fix a bad key', () => {
    expect(isRetryableRoundTripFailure(new UpstreamError('OpenRouteService', 'svarte 401', 401))).toBe(
      false
    );
  });

  it('does not retry a rate limit — retrying immediately would only make it worse', () => {
    expect(isRetryableRoundTripFailure(new UpstreamError('OpenRouteService', 'svarte 429', 429))).toBe(
      false
    );
  });

  it('does not retry an error that never reached ORS', () => {
    expect(isRetryableRoundTripFailure(new Error('network down'))).toBe(false);
  });

  // Generating a loop with elevation is slow work that sometimes overruns.
  // Giving up the remaining attempts over one slow answer threw away the very
  // retries that make this feature work at all.
  it('retries a timeout, which costs an attempt but says nothing about the loop', () => {
    expect(
      isRetryableRoundTripFailure(
        new UpstreamError('OpenRouteService', 'OpenRouteService svarte ikke innen 10 sekunder')
      )
    ).toBe(true);
  });

  it('retries our own "found no loop", since a fresh seed may well find one', () => {
    expect(
      isRetryableRoundTripFailure(
        new UpstreamError('OpenRouteService', 'Fant ingen rundtur fra denne posisjonen')
      )
    ).toBe(true);
  });

  /**
   * Observed in production: ORS reports "could not find routable point within a
   * radius of 350.0 meters of specified coordinate" as code 2010 — over an HTTP
   * 404, the same status as the transient blips above. No number of fresh seeds
   * moves the rider closer to a road.
   */
  it('does not retry a coordinate that is nowhere near a road', () => {
    expect(
      isRetryableRoundTripFailure(
        new UpstreamError(
          'OpenRouteService',
          'OpenRouteService svarte 404',
          404,
          'Could not find routable point within a radius of 350.0 meters (kode 2010)',
          2010
        )
      )
    ).toBe(false);
  });

  it('still retries a 404 that carries no such code', () => {
    expect(
      isRetryableRoundTripFailure(
        new UpstreamError('OpenRouteService', 'OpenRouteService svarte 404', 404)
      )
    ).toBe(true);
  });
});

describe('pickSampleIndices', () => {
  it('always includes both ends', () => {
    const indices = pickSampleIndices(1000, 75);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(999);
  });

  it('never exceeds the requested count', () => {
    expect(pickSampleIndices(1000, 75).length).toBeLessThanOrEqual(75);
  });

  it('returns strictly increasing, unique indices', () => {
    const indices = pickSampleIndices(1000, 75);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it('returns every index when the line is shorter than the sample count', () => {
    expect(pickSampleIndices(5, 75)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('elevationStats', () => {
  const profile: ElevationPoint[] = [
    { distanceKm: 0, elevationM: 100, lat: 62, lng: 7 },
    { distanceKm: 10, elevationM: 400, lat: 62.1, lng: 7 },
    { distanceKm: 20, elevationM: 250, lat: 62.2, lng: 7 },
    { distanceKm: 30, elevationM: 600, lat: 62.3, lng: 7 },
  ];

  it('sums climbs and descents separately', () => {
    expect(elevationStats(profile)).toEqual({
      elevationGainM: 650, // 300 up + 350 up
      elevationLossM: 150,
      maxElevationM: 600,
    });
  });

  it('reports null rather than zero when there is no elevation data', () => {
    // Zero would render as a perfectly flat "+0 m" profile, which reads as a
    // measurement. Null lets the UI say the data is simply unavailable.
    expect(elevationStats(null)).toEqual({
      elevationGainM: null,
      elevationLossM: null,
      maxElevationM: null,
    });
    expect(elevationStats([])).toEqual({
      elevationGainM: null,
      elevationLossM: null,
      maxElevationM: null,
    });
  });

  it('handles a single sampled point', () => {
    expect(elevationStats([profile[0]])).toEqual({
      elevationGainM: 0,
      elevationLossM: 0,
      maxElevationM: 100,
    });
  });
});

/**
 * Reported against the app's own comment that the estimate "excludes ferry
 * waits": the sailing time was there all along inside the engine's duration,
 * and the riding-pace adjustment was being applied to it — claiming a twisty
 * road slows the boat down too.
 */
describe('estimated duration with a ferry aboard', () => {
  it('leaves the crossing at the time the boat takes', () => {
    // One hour total, fifteen minutes of it afloat, on a properly twisty road.
    const withFerry = estimatedDurationMin(60 * 60, 250, 15 * 60);
    const withoutFerry = estimatedDurationMin(60 * 60, 250);

    expect(withFerry).toBe(Math.round(45 * 1.2 + 15));
    expect(withFerry).toBeLessThan(withoutFerry);
  });

  it('behaves exactly as before on a route with no ferry', () => {
    expect(estimatedDurationMin(60 * 60, 250, 0)).toBe(estimatedDurationMin(60 * 60, 250));
  });

  it('never goes negative if an engine reports more ferry than route', () => {
    expect(estimatedDurationMin(600, 250, 9999)).toBeGreaterThanOrEqual(0);
  });
});

describe('avoiding ferries on the OSRM path', () => {
  it('prefers the alternative that uses less ferry when asked', () => {
    const viaFerry = candidate(twistyLine, 100);
    viaFerry.legs = [{ steps: [{ distance: 40_000, mode: 'ferry' }] }];
    const overLand = candidate(twistyLine, 100);
    overLand.legs = [{ steps: [{ distance: 0, mode: 'driving' }] }];

    expect(pickBestRoute([viaFerry, overLand], 'curvy', true, true)).toBe(overLand);
  });

  it('leaves the choice alone when the rider has not asked', () => {
    const viaFerry = candidate(twistyLine, 100);
    viaFerry.legs = [{ steps: [{ distance: 40_000, mode: 'ferry' }] }];
    const overLand = candidate(straightLine, 260);

    expect(pickBestRoute([viaFerry, overLand], 'curvy', true, false)).toBe(viaFerry);
  });
});

/**
 * Reported from a round trip out of Oslo: flipping "Unngå motorvei" returned a
 * byte-identical route, distance, time and all. The rule read
 * `avoidHighways || profile !== 'fastest'`, so picking "Svingete veier" avoided
 * motorways whatever the switch said — a control that could not control
 * anything in the style most riders use.
 */
describe('avoidedFeatures', () => {
  it('keeps motorways out when the rider asks, whichever style is picked', () => {
    expect(avoidedFeatures(true, false)).toContain('highways');
  });

  it('lets them back in when the rider turns the switch off', () => {
    expect(avoidedFeatures(false, false)).toEqual([]);
  });

  it('no longer decides anything from the riding style', () => {
    // The style is not even an argument any more, which is the fix: it cannot
    // quietly override a switch it is not given.
    expect(avoidedFeatures.length).toBe(2);
  });

  it('adds ferries independently of the motorway switch', () => {
    expect(avoidedFeatures(false, true)).toEqual(['ferries']);
    expect(avoidedFeatures(true, true)).toEqual(['highways', 'tollways', 'ferries']);
  });
});
