import { describe, expect, it } from 'vitest';
import { MOUNTAIN_PASSES, type MountainPass, passStatus } from './mountainPasses';

const sognefjellet = MOUNTAIN_PASSES.find((p) => p.id === 'sognefjellet')!;
const strynefjellet = MOUNTAIN_PASSES.find((p) => p.id === 'strynefjellet_gamle')!;
const hardangervidda = MOUNTAIN_PASSES.find((p) => p.id === 'hardangervidda')!;

describe('passStatus', () => {
  it('reports a summer-only pass as closed in midwinter', () => {
    // The bug this guards against: the old endpoint hard-coded every pass to
    // "open", so in January it told riders Sognefjellet was open for traffic.
    expect(passStatus(sognefjellet, new Date('2026-01-15')).status).toBe('closed_seasonal');
  });

  it('reports a summer-only pass as open in midsummer', () => {
    expect(passStatus(sognefjellet, new Date('2026-07-15')).status).toBe('open');
  });

  it('refuses to guess near the typical opening date', () => {
    // Gamle Strynefjellsvegen typically opens 1 June; a week either side is
    // exactly when riders get caught out by a late snow year.
    expect(passStatus(strynefjellet, new Date('2026-05-28')).status).toBe('uncertain');
    expect(passStatus(strynefjellet, new Date('2026-06-05')).status).toBe('uncertain');
  });

  it('refuses to guess near the typical closing date', () => {
    expect(passStatus(strynefjellet, new Date('2026-10-12')).status).toBe('uncertain');
  });

  it('treats year-round roads as open but flags winter conditions', () => {
    const summer = passStatus(hardangervidda, new Date('2026-07-15'));
    const winter = passStatus(hardangervidda, new Date('2026-01-15'));

    expect(summer.status).toBe('open');
    expect(winter.status).toBe('open');
    expect(winter.label).toMatch(/vinterforhold/i);
  });

  it('always explains what the status is based on', () => {
    for (const pass of MOUNTAIN_PASSES) {
      const result = passStatus(pass, new Date('2026-09-01'));
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it('handles a pass with no season data without crashing', () => {
    const unknown: MountainPass = {
      id: 'x',
      name: 'Ukjent',
      road: 'Fv1',
      description: '',
      lat: 60,
      lng: 8,
    };
    expect(passStatus(unknown, new Date('2026-02-01')).status).toBe('open');
  });
});

describe('MOUNTAIN_PASSES data', () => {
  it('has unique ids', () => {
    const ids = MOUNTAIN_PASSES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places every pass inside Norway', () => {
    for (const pass of MOUNTAIN_PASSES) {
      expect(pass.lat).toBeGreaterThan(57);
      expect(pass.lat).toBeLessThan(72);
      expect(pass.lng).toBeGreaterThan(4);
      expect(pass.lng).toBeLessThan(32);
    }
  });

  it('opens before it closes, for every seasonal pass', () => {
    for (const pass of MOUNTAIN_PASSES) {
      if (!pass.typicalOpen || !pass.typicalClose) continue;
      const [openMonth, openDay] = pass.typicalOpen;
      const [closeMonth, closeDay] = pass.typicalClose;
      expect(openMonth * 100 + openDay).toBeLessThan(closeMonth * 100 + closeDay);
    }
  });
});
