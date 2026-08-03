import { describe, expect, it } from 'vitest';
import type { Waypoint } from '../types';
import { buildShareUrl, decodeRouteFromHash, encodeRouteToHash } from './routeLink';

const waypoints: Waypoint[] = [
  { id: 'a', name: 'Åndalsnes', lat: 62.5674, lng: 7.6872 },
  { id: 'b', name: 'Geiranger', lat: 62.0998, lng: 7.2056 },
];

describe('route links', () => {
  it('round-trips a route through the hash', () => {
    const decoded = decodeRouteFromHash(encodeRouteToHash(waypoints, 'curvy', true));

    expect(decoded).not.toBeNull();
    expect(decoded!.profile).toBe('curvy');
    expect(decoded!.avoidHighways).toBe(true);
    expect(decoded!.waypoints).toHaveLength(2);
    expect(decoded!.waypoints[0].lat).toBeCloseTo(62.5674, 5);
    expect(decoded!.waypoints[1].lng).toBeCloseTo(7.2056, 5);
  });

  it('survives Norwegian characters in place names', () => {
    const decoded = decodeRouteFromHash(encodeRouteToHash(waypoints, 'curvy', false));
    expect(decoded!.waypoints[0].name).toBe('Åndalsnes');
  });

  /**
   * Links shared back when 'scenic' was still a separate style are out in group
   * chats and must still open. It always produced the same route as 'curvy', so
   * landing there is where those links effectively pointed all along.
   */
  it('opens a link from when scenic was still a separate style', () => {
    const payload = {
      v: 1,
      p: 'scenic',
      a: 1,
      w: [
        [62.5674, 7.6869, 'Åndalsnes'],
        [62.1049, 7.2056, 'Geiranger'],
      ],
    };
    const base64url = Buffer.from(JSON.stringify(payload))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const decoded = decodeRouteFromHash(`#tur=${base64url}`);

    expect(decoded).not.toBeNull();
    expect(decoded!.profile).toBe('curvy');
    expect(decoded!.waypoints).toHaveLength(2);
  });

  it('preserves the avoid-motorways choice when it is off', () => {
    const decoded = decodeRouteFromHash(encodeRouteToHash(waypoints, 'fastest', false));
    expect(decoded!.avoidHighways).toBe(false);
    expect(decoded!.profile).toBe('fastest');
  });

  it('produces nothing for a route with fewer than two placed waypoints', () => {
    const empty: Waypoint[] = [
      { id: 'a', name: '', lat: 0, lng: 0 },
      { id: 'b', name: '', lat: 0, lng: 0 },
    ];
    expect(encodeRouteToHash(empty, 'curvy', true)).toBe('');
    expect(buildShareUrl(empty, 'curvy', true, false, 'https://sving.no/')).toBe('');
  });

  it('replaces any existing hash rather than appending to it', () => {
    const url = buildShareUrl(waypoints, 'curvy', true, false, 'https://sving.no/?a=1#tur=old');
    expect(url.startsWith('https://sving.no/?a=1#tur=')).toBe(true);
    expect(url.match(/#/g)).toHaveLength(1);
  });


  it('returns null for malformed links instead of throwing', () => {
    expect(decodeRouteFromHash('')).toBeNull();
    expect(decodeRouteFromHash('#')).toBeNull();
    expect(decodeRouteFromHash('#tur=not-valid-base64!!!')).toBeNull();
    expect(decodeRouteFromHash('#annet=abc')).toBeNull();
    // Valid base64 of JSON that is not a route payload.
    expect(decodeRouteFromHash('#tur=eyJoZWxsbyI6MX0')).toBeNull();
  });

  it('rejects out-of-range coordinates in a crafted link', () => {
    const payload = { v: 1, p: 'curvy', a: 1, w: [[999, 999, 'x'], [62, 7, 'y']] };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Only one waypoint survives validation, so the whole link is rejected.
    expect(decodeRouteFromHash(`#tur=${encoded}`)).toBeNull();
  });

  it('falls back to a safe profile when the link claims an unknown one', () => {
    const payload = { v: 1, p: 'rocket', a: 1, w: [[62.5, 7.6, 'a'], [62, 7, 'b']] };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(decodeRouteFromHash(`#tur=${encoded}`)!.profile).toBe('curvy');
  });

  /**
   * Links are sent in group chats and cannot be revoked or migrated, so a link
   * made before the ferry switch existed has to keep working exactly as it did.
   */
  it('reads a link written before ferries were a choice', () => {
    const older = encodeRouteToHash(waypoints, 'curvy', true);
    expect(decodeRouteFromHash(older)?.avoidFerries).toBe(false);
  });

  it('carries the ferry choice both ways', () => {
    const hash = encodeRouteToHash(waypoints, 'curvy', true, true);
    expect(decodeRouteFromHash(hash)?.avoidFerries).toBe(true);
  });
});
