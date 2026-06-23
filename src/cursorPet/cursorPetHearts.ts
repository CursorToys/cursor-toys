/** Max hearts shown in the Tamagotchi-style HUD (0–4). */
export const PET_MAX_HEARTS = 4;

/**
 * Maps internal vitals (0–100) to whole hearts (0–4).
 */
export function vitalsToHearts(value: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  return Math.min(PET_MAX_HEARTS, Math.floor(clamped / 25));
}

/**
 * Returns fill ratio for a partial heart segment (0–1).
 */
export function vitalsHeartFill(value: number, heartIndex: number): number {
  const clamped = Math.min(100, Math.max(0, value));
  const segmentStart = heartIndex * 25;
  const segmentEnd = segmentStart + 25;
  if (clamped <= segmentStart) {
    return 0;
  }
  if (clamped >= segmentEnd) {
    return 1;
  }
  return (clamped - segmentStart) / 25;
}
