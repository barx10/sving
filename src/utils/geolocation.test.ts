import { describe, expect, it, vi } from 'vitest';
import { GeolocationError, describeGeolocationError, getRiderPosition } from './geolocation';

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/** Shaped like the real thing, including the code constants callers compare against. */
function positionError(code: number, message: string): GeolocationPositionError {
  return { code, message, PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT } as GeolocationPositionError;
}

function position(lat: number, lng: number): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lng }, timestamp: Date.now() } as GeolocationPosition;
}

/** A Geolocation stub that answers each call from a queued script. */
function fakeGeolocation(answers: (GeolocationPosition | GeolocationPositionError)[]) {
  const options: PositionOptions[] = [];
  const geolocation = {
    getCurrentPosition: vi.fn((onSuccess, onError, opts) => {
      options.push(opts as PositionOptions);
      const answer = answers.shift();
      if (answer && 'coords' in answer) onSuccess(answer);
      else onError?.(answer as GeolocationPositionError);
    }),
  } as unknown as Geolocation;

  return { geolocation, options };
}

describe('getRiderPosition', () => {
  it('returns the precise fix when the browser manages one', async () => {
    const { geolocation, options } = fakeGeolocation([position(62.5674, 7.6869)]);

    await expect(getRiderPosition(geolocation)).resolves.toEqual({ lat: 62.5674, lng: 7.6869 });
    expect(options).toHaveLength(1);
    expect(options[0].enableHighAccuracy).toBe(true);
  });

  /** kCLErrorLocationUnknown on macOS arrives as POSITION_UNAVAILABLE. */
  it('falls back to a coarse, possibly cached fix when the precise one fails', async () => {
    const { geolocation, options } = fakeGeolocation([
      positionError(POSITION_UNAVAILABLE, 'kCLErrorLocationUnknown'),
      position(59.9139, 10.7522),
    ]);

    await expect(getRiderPosition(geolocation)).resolves.toEqual({ lat: 59.9139, lng: 10.7522 });
    expect(options).toHaveLength(2);
    expect(options[1].enableHighAccuracy).toBe(false);
    expect(options[1].maximumAge).toBeGreaterThan(0);
  });

  it('retries a timeout too, with a longer deadline', async () => {
    const { geolocation, options } = fakeGeolocation([
      positionError(TIMEOUT, 'Timeout expired'),
      position(60.39, 5.32),
    ]);

    await expect(getRiderPosition(geolocation)).resolves.toEqual({ lat: 60.39, lng: 5.32 });
    expect(options[1].timeout).toBeGreaterThan(options[0].timeout!);
  });

  it('does not retry a denied permission — the answer would be the same', async () => {
    const { geolocation, options } = fakeGeolocation([
      positionError(PERMISSION_DENIED, 'User denied geolocation'),
    ]);

    await expect(getRiderPosition(geolocation)).rejects.toMatchObject({ reason: 'denied' });
    expect(options).toHaveLength(1);
  });

  it('reports both attempts failing as one actionable message', async () => {
    const { geolocation } = fakeGeolocation([
      positionError(POSITION_UNAVAILABLE, 'kCLErrorLocationUnknown'),
      positionError(POSITION_UNAVAILABLE, 'kCLErrorLocationUnknown'),
    ]);

    const error = await getRiderPosition(geolocation).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GeolocationError);
    expect((error as GeolocationError).reason).toBe('unavailable');
    expect((error as GeolocationError).message).not.toContain('kCLError');
  });

  it('says so when the browser has no geolocation at all', async () => {
    await expect(getRiderPosition(undefined)).rejects.toMatchObject({ reason: 'unsupported' });
  });
});

describe('describeGeolocationError', () => {
  it('names the setting to change rather than the framework that failed', () => {
    const message = describeGeolocationError(
      positionError(POSITION_UNAVAILABLE, 'kCLErrorLocationUnknown')
    ).message;

    expect(message).toContain('Stedstjenester');
    expect(message).not.toContain('kCLError');
  });

  it('points a blocked permission at the browser, not at the operating system', () => {
    expect(describeGeolocationError(positionError(PERMISSION_DENIED, 'denied')).message).toContain(
      'blokkert'
    );
  });
});
