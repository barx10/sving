export type GeolocationFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/** Carries a message that is already fit to show the rider. */
export class GeolocationError extends Error {
  constructor(
    readonly reason: GeolocationFailure,
    message: string
  ) {
    super(message);
    this.name = 'GeolocationError';
  }
}

/** A first, quick attempt at a precise fix — GPS or WiFi triangulation. */
const PRECISE_TIMEOUT_MS = 8000;
/** The fallback is allowed to take longer, since it is the last chance. */
const COARSE_TIMEOUT_MS = 15000;
/**
 * How old a cached position may be on the fallback attempt. Five minutes of
 * riding is a few kilometres at most, and this app only needs to know which
 * part of the country the rider is in.
 */
const COARSE_MAX_AGE_MS = 5 * 60_000;

/**
 * Turns a browser geolocation failure into something a rider can act on. The
 * raw messages are written for developers — macOS in particular reports a
 * failed fix as "kCLErrorLocationUnknown", which says nothing about the
 * setting that actually needs changing.
 */
export function describeGeolocationError(error: GeolocationPositionError): GeolocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new GeolocationError(
        'denied',
        'Nettleseren har blokkert posisjon for Sving. Tillat posisjon for nettstedet, eller søk opp startstedet i stedet.'
      );
    case error.TIMEOUT:
      return new GeolocationError(
        'timeout',
        'Det tok for lang tid å finne posisjonen din. Prøv igjen, eller søk opp startstedet i stedet.'
      );
    default:
      return new GeolocationError(
        'unavailable',
        'Fant ikke posisjonen din. Sjekk at stedstjenester er på for nettleseren — på Mac ligger det under Systeminnstillinger → Personvern og sikkerhet → Stedstjenester. Du kan også søke opp startstedet i stedet.'
      );
  }
}

function requestPosition(
  geolocation: Geolocation,
  options: PositionOptions
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * The rider's position, in two attempts. A precise fix is asked for first, and
 * when that fails — which macOS does readily, with kCLErrorLocationUnknown, any
 * time WiFi triangulation comes up empty — a coarse one is tried, this time
 * accepting a recent cached position. That second attempt is what usually
 * succeeds, and a rough position is entirely good enough for "hva ligger nær
 * meg". A denied permission is not retried: the answer would be the same, and
 * a second prompt only wears out the rider.
 */
export async function getRiderPosition(
  geolocation: Geolocation | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.geolocation
): Promise<{ lat: number; lng: number }> {
  if (!geolocation) {
    throw new GeolocationError('unsupported', 'Geolokasjon støttes ikke i denne nettleseren.');
  }

  try {
    const precise = await requestPosition(geolocation, {
      enableHighAccuracy: true,
      timeout: PRECISE_TIMEOUT_MS,
      maximumAge: 0,
    });
    return { lat: precise.coords.latitude, lng: precise.coords.longitude };
  } catch (err) {
    const first = err as GeolocationPositionError;
    if (first.code === first.PERMISSION_DENIED) throw describeGeolocationError(first);

    try {
      const coarse = await requestPosition(geolocation, {
        enableHighAccuracy: false,
        timeout: COARSE_TIMEOUT_MS,
        maximumAge: COARSE_MAX_AGE_MS,
      });
      return { lat: coarse.coords.latitude, lng: coarse.coords.longitude };
    } catch (fallbackErr) {
      throw describeGeolocationError(fallbackErr as GeolocationPositionError);
    }
  }
}
