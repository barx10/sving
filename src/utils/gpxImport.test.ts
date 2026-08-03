import { describe, expect, it } from 'vitest';
import { GpxImportError, parseGpx, thinToLimit, type ImportedPoint } from './gpxImport';

const wrap = (inner: string, creator = 'SomeOtherApp'): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1">
${inner}
</gpx>`;

const trkpt = (lat: number, lng: number): string => `<trkpt lat="${lat}" lon="${lng}"></trkpt>`;

describe('parseGpx', () => {
  it('reads a planned route from rtept, which says outright what it is', () => {
    const gpx = wrap(`<rte>
      <rtept lat="62.5674" lon="7.6869"><name>Åndalsnes</name></rtept>
      <rtept lat="62.3" lon="7.35"><name>Valldal</name></rtept>
    </rte>`);

    const imported = parseGpx(gpx, 8);
    expect(imported.source).toBe('route');
    expect(imported.points).toEqual([
      { name: 'Åndalsnes', lat: 62.5674, lng: 7.6869 },
      { name: 'Valldal', lat: 62.3, lng: 7.35 },
    ]);
  });

  it('reads the track when a foreign file has one', () => {
    const gpx = wrap(`<trk><trkseg>${trkpt(62.5, 7.6)}${trkpt(62.4, 7.5)}</trkseg></trk>`);
    expect(parseGpx(gpx, 8).source).toBe('track');
  });

  /**
   * A foreign file's <wpt> are usually points of interest scattered near the
   * ride — fuel, viewpoints — and routing through them in file order would
   * produce a nonsense route. The track is what was actually ridden.
   */
  it('prefers a foreign file’s track over its scattered waypoints', () => {
    const gpx = wrap(`
      <wpt lat="63.0" lon="9.0"><name>Bensin</name></wpt>
      <wpt lat="61.0" lon="6.0"><name>Utsikt</name></wpt>
      <trk><trkseg>${trkpt(62.5, 7.6)}${trkpt(62.4, 7.5)}</trkseg></trk>`);

    const imported = parseGpx(gpx, 8);
    expect(imported.source).toBe('track');
    expect(imported.points[0]).toMatchObject({ lat: 62.5 });
  });

  /** Our own export carries the planned waypoints in <wpt>, names and all. */
  it('restores our own export from its waypoints rather than approximating the line', () => {
    const gpx = wrap(
      `<wpt lat="62.5674" lon="7.6869"><name>Åndalsnes</name></wpt>
       <wpt lat="62.3" lon="7.35"><name>Valldal</name></wpt>
       <trk><trkseg>${trkpt(62.5, 7.6)}${trkpt(62.45, 7.55)}${trkpt(62.4, 7.5)}</trkseg></trk>`,
      'Sving - norsk MC-turplanlegger'
    );

    const imported = parseGpx(gpx, 8);
    expect(imported.source).toBe('waypoints');
    expect(imported.points.map((p) => p.name)).toEqual(['Åndalsnes', 'Valldal']);
  });

  it('falls back to waypoints when that is all the file has', () => {
    const gpx = wrap(`<wpt lat="62.5" lon="7.6"></wpt><wpt lat="62.4" lon="7.5"></wpt>`);
    expect(parseGpx(gpx, 8).source).toBe('waypoints');
  });

  it('copes with a namespace prefix on every tag', () => {
    const gpx = `<gpx:gpx version="1.1" xmlns:gpx="http://www.topografix.com/GPX/1/1">
      <gpx:trk><gpx:trkseg>
        <gpx:trkpt lat="62.5" lon="7.6"></gpx:trkpt>
        <gpx:trkpt lat="62.4" lon="7.5"></gpx:trkpt>
      </gpx:trkseg></gpx:trk></gpx:gpx>`;

    expect(parseGpx(gpx, 8).points).toHaveLength(2);
  });

  it('reads self-closing points, which plenty of exporters write', () => {
    const gpx = wrap(`<rte><rtept lat="62.5" lon="7.6"/><rtept lat="62.4" lon="7.5"/></rte>`);
    expect(parseGpx(gpx, 8).points).toHaveLength(2);
  });

  it('decodes escaped names instead of showing the escape', () => {
    const gpx = wrap(
      `<rte><rtept lat="62.5" lon="7.6"><name>Rest &amp; ro</name></rtept>
       <rtept lat="62.4" lon="7.5"><name><![CDATA[Vøringsfossen]]></name></rtept></rte>`
    );

    expect(parseGpx(gpx, 8).points.map((p) => p.name)).toEqual(['Rest & ro', 'Vøringsfossen']);
  });

  it('skips points with coordinates that are not on earth', () => {
    const gpx = wrap(
      `<rte><rtept lat="62.5" lon="7.6"/><rtept lat="999" lon="7.5"/><rtept lat="62.4" lon="7.4"/></rte>`
    );

    expect(parseGpx(gpx, 8).points).toHaveLength(2);
  });

  it('rejects a file that is not GPX at all', () => {
    expect(() => parseGpx('{"type":"FeatureCollection"}', 8)).toThrow(GpxImportError);
  });

  it('rejects a GPX with nothing routable in it', () => {
    expect(() => parseGpx(wrap('<metadata><name>Tom</name></metadata>'), 8)).toThrow(
      /minst to punkter/
    );
  });

  it('reports how many points the file held, not how many survived', () => {
    const many = Array.from({ length: 500 }, (_, i) => trkpt(62 + i * 0.001, 7)).join('');
    const imported = parseGpx(wrap(`<trk><trkseg>${many}</trkseg></trk>`), 8);

    expect(imported.originalCount).toBe(500);
    expect(imported.points).toHaveLength(8);
  });
});

describe('thinToLimit', () => {
  const point = (lat: number, lng = 7): ImportedPoint => ({ name: '', lat, lng });

  it('leaves a list that already fits alone', () => {
    const three = [point(62), point(62.1), point(62.2)];
    expect(thinToLimit(three, 8)).toEqual(three);
  });

  it('keeps the start and the finish', () => {
    const points = Array.from({ length: 100 }, (_, i) => point(62 + i * 0.01));
    const thinned = thinToLimit(points, 5);

    expect(thinned[0]).toEqual(points[0]);
    expect(thinned[thinned.length - 1]).toEqual(points[points.length - 1]);
    expect(thinned).toHaveLength(5);
  });

  /**
   * A recorded track bunches its points where the rider went slowly — through
   * the hairpins. Picking every nth point would spend the whole budget there
   * and skip the valley entirely, so the spacing is by distance.
   */
  it('spaces by distance, not by index', () => {
    const hairpins = Array.from({ length: 90 }, (_, i) => point(62 + i * 0.0001));
    const valley = Array.from({ length: 10 }, (_, i) => point(62.009 + i * 0.05));
    const thinned = thinToLimit([...hairpins, ...valley], 4);

    // Every-nth would have put all four inside the first 9 metres of hairpin.
    const spread = thinned[thinned.length - 1].lat - thinned[0].lat;
    expect(thinned.filter((p) => p.lat > 62.05)).not.toHaveLength(0);
    expect(spread).toBeGreaterThan(0.4);
  });

  it('survives a file where every point is the same spot', () => {
    const stuck = Array.from({ length: 50 }, () => point(62));
    expect(thinToLimit(stuck, 5)).toHaveLength(2);
  });
});
