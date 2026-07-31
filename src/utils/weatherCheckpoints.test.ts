import { describe, expect, it } from 'vitest';
import { pickWeatherFractions } from './weatherCheckpoints';

describe('pickWeatherFractions', () => {
  it('gives a short loop just start and end, not five closely-spaced points', () => {
    // ~2h08m round trip, the exact case reported: 5 fixed points meant two of
    // them landed on the same named waypoint 32 minutes apart.
    expect(pickWeatherFractions(128)).toEqual([0, 0.5, 1]);
  });

  it('never returns fewer than two points, however short the ride', () => {
    expect(pickWeatherFractions(20)).toEqual([0, 1]);
    expect(pickWeatherFractions(0)).toEqual([0, 1]);
  });

  it('caps at six points for a long touring day', () => {
    const fractions = pickWeatherFractions(20 * 60);
    expect(fractions.length).toBe(6);
  });

  it('always includes both endpoints', () => {
    for (const duration of [0, 45, 90, 180, 300, 600]) {
      const fractions = pickWeatherFractions(duration);
      expect(fractions[0]).toBe(0);
      expect(fractions[fractions.length - 1]).toBe(1);
    }
  });

  it('spaces checkpoints evenly', () => {
    const fractions = pickWeatherFractions(240);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i] - fractions[i - 1]).toBeCloseTo(1 / (fractions.length - 1));
    }
  });

  it('scales up roughly one checkpoint per hour', () => {
    expect(pickWeatherFractions(60).length).toBe(2);
    expect(pickWeatherFractions(90).length).toBe(3);
    expect(pickWeatherFractions(180).length).toBe(4);
  });
});
