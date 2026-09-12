/**
 * 4-segment battery fill from device percent_charged (0–100).
 * Segments = ceil(pct/25) clamped to 1..4 (0% → 1).
 * Below 25%: that single fill is treated as low (red).
 */
export function batterySegments(percent: number): {
  filled: number;
  low: boolean;
} {
  const pct = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
  const filled = Math.min(4, Math.max(1, Math.ceil(pct / 25)));
  return { filled, low: pct < 25 };
}

/** Segment indices 1..4 that should be filled for a given percent. */
export function batteryFilledIndexes(percent: number): number[] {
  const { filled } = batterySegments(percent);
  return Array.from({ length: filled }, (_, i) => i + 1);
}
