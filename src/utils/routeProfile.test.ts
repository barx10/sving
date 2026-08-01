import { describe, expect, it } from 'vitest';
import { curvatureRankingApplies, normalizeProfile } from './routeProfile';

describe('normalizeProfile', () => {
  it('keeps the two styles that exist', () => {
    expect(normalizeProfile('curvy')).toBe('curvy');
    expect(normalizeProfile('fastest')).toBe('fastest');
  });

  it('lands scenic on curvy, which is what it always produced', () => {
    expect(normalizeProfile('scenic')).toBe('curvy');
  });

  it('falls back to curvy for anything unrecognised', () => {
    expect(normalizeProfile(undefined)).toBe('curvy');
    expect(normalizeProfile('')).toBe('curvy');
    expect(normalizeProfile(42)).toBe('curvy');
  });
});

describe('curvatureRankingApplies', () => {
  const andalsnes = { lat: 62.5674, lng: 7.6869 };
  const valldal = { lat: 62.3, lng: 7.35 };
  const oslo = { lat: 59.9139, lng: 10.7522 };

  it('applies to a short A-to-B route, where alternatives exist to rank', () => {
    expect(curvatureRankingApplies([andalsnes, valldal])).toBe(true);
  });

  it('does not apply once a via point is added', () => {
    expect(curvatureRankingApplies([andalsnes, valldal, oslo])).toBe(false);
  });

  it('does not apply to a long route, where the engine offers no alternatives', () => {
    expect(curvatureRankingApplies([andalsnes, oslo])).toBe(false);
  });

  it('needs both ends before it can decide anything', () => {
    expect(curvatureRankingApplies([])).toBe(false);
    expect(curvatureRankingApplies([andalsnes])).toBe(false);
  });
});
