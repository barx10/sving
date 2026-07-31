const MIN_WEATHER_CHECKPOINTS = 2;
const MAX_WEATHER_CHECKPOINTS = 6;

/**
 * Distance-fraction checkpoints for the weather-along-the-route feature.
 *
 * A fixed 5 checkpoints made sense for a multi-hour touring route, but for a
 * short loop it produces closely-spaced points — minutes apart — showing
 * near-identical weather, each labelled by whichever named waypoint happens
 * to be nearest. A loop that revisits the same waypoint name at both ends
 * then shows that name twice a few minutes apart, which reads as duplicated
 * or broken output rather than two genuinely different points in time.
 *
 * Scaling the count to roughly one checkpoint per hour of riding fixes both
 * ends: a 30-minute spin gets just start and end, a 6-hour touring day still
 * gets full coverage.
 */
export function pickWeatherFractions(durationMin: number): number[] {
  const hours = durationMin / 60;
  const count = Math.min(
    MAX_WEATHER_CHECKPOINTS,
    Math.max(MIN_WEATHER_CHECKPOINTS, Math.round(hours) + 1)
  );

  if (count === 2) return [0, 1];
  return Array.from({ length: count }, (_, i) => i / (count - 1));
}
