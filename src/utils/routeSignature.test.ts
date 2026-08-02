import { describe, expect, it } from 'vitest';
import { routeSignatureOf } from './routeSignature';
import type { Waypoint } from '../types';

const andalsnes: Waypoint = { id: 'a', name: 'Åndalsnes', lat: 62.5674, lng: 7.6869 };
const valldal: Waypoint = { id: 'b', name: 'Valldal', lat: 62.3, lng: 7.35 };
const empty: Waypoint = { id: 'c', name: '', lat: 0, lng: 0 };

describe('routeSignatureOf', () => {
  it('ignores the name a point picks up from reverse geocoding', () => {
    const before = routeSignatureOf([{ ...andalsnes, name: 'Kartpunkt (62.567, 7.687)' }, valldal], 'curvy', true);
    const after = routeSignatureOf([andalsnes, valldal], 'curvy', true);
    expect(after).toBe(before);
  });

  it('ignores ids, which are regenerated whenever a route is rebuilt', () => {
    const reloaded = [
      { ...andalsnes, id: 'preset_wp_0_123' },
      { ...valldal, id: 'preset_wp_1_123' },
    ];
    expect(routeSignatureOf(reloaded, 'curvy', true)).toBe(
      routeSignatureOf([andalsnes, valldal], 'curvy', true)
    );
  });

  it('changes when a point moves', () => {
    expect(routeSignatureOf([andalsnes, { ...valldal, lat: 62.31 }], 'curvy', true)).not.toBe(
      routeSignatureOf([andalsnes, valldal], 'curvy', true)
    );
  });

  it('changes when the points are reordered', () => {
    expect(routeSignatureOf([valldal, andalsnes], 'curvy', true)).not.toBe(
      routeSignatureOf([andalsnes, valldal], 'curvy', true)
    );
  });

  it('changes with the riding style and the motorway switch', () => {
    const base = routeSignatureOf([andalsnes, valldal], 'curvy', true);
    expect(routeSignatureOf([andalsnes, valldal], 'fastest', true)).not.toBe(base);
    expect(routeSignatureOf([andalsnes, valldal], 'curvy', false)).not.toBe(base);
  });

  it('leaves out placeholder rows the rider has not filled in yet', () => {
    expect(routeSignatureOf([andalsnes, empty, valldal], 'curvy', true)).toBe(
      routeSignatureOf([andalsnes, valldal], 'curvy', true)
    );
  });
});
