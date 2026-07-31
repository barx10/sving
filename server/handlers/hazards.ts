import { MOUNTAIN_PASSES, VEGVESEN_STATUS_URL, passStatus } from '../../src/data/mountainPasses';
import type { ApiResult } from './apiResult';

/**
 * Seasonal status for the mountain passes that matter to motorcyclists.
 *
 * This is explicitly NOT a live feed. The previous version of this endpoint
 * returned a hard-coded list where every pass was 'open' with `updated` set to
 * the current timestamp, which made stale reference data look like it had just
 * been fetched from Statens vegvesen. In January it cheerfully reported
 * Sognefjellet as open for traffic.
 *
 * The response now carries its own provenance so the UI cannot accidentally
 * present it as authoritative, and every pass links onward to Vegvesen.
 */
export function handleHazardsRequest(now: Date = new Date()): ApiResult {
  const passes = MOUNTAIN_PASSES.map((pass) => {
    const { status, label, detail } = passStatus(pass, now);
    return {
      id: pass.id,
      name: pass.name,
      road: pass.road,
      description: pass.description,
      lat: pass.lat,
      lng: pass.lng,
      summitM: pass.summitM,
      note: pass.note,
      status,
      statusLabel: label,
      statusDetail: detail,
    };
  });

  return {
    status: 200,
    body: {
      passes,
      dataSource: 'curated-seasonal',
      disclaimer:
        'Statusen er beregnet fra typiske åpnings- og stengedatoer, ikke fra sanntidsdata. ' +
        'Fjelloverganger kan stenge på timers varsel. Sjekk alltid Statens vegvesen før avreise.',
      verifyUrl: VEGVESEN_STATUS_URL,
      generatedAt: now.toISOString(),
    },
    // Purely calendar-derived, so let CDN edges absorb repeat traffic for a while.
    headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
  };
}
