// A palette of 150 reasonably distinct colors. Hues are spread with the
// golden-angle sequence (avoids adjacent-hue clustering), and saturation /
// lightness cycle through a few bands to separate colors that share a hue.
function buildPalette(count: number): string[] {
  const GOLDEN_ANGLE = 137.508;
  const palette: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * GOLDEN_ANGLE) % 360;
    const saturation = 65 + (i % 3) * 10; // 65 / 75 / 85
    const lightness = 45 + (i % 5) * 6; // 45 → 69
    palette.push(`hsl(${hue.toFixed(1)}, ${saturation}%, ${lightness}%)`);
  }
  return palette;
}

export const PING_PALETTE: readonly string[] = buildPalette(150);

// Small string hash so the color spread doesn't depend on MMSI numeric clustering.
function hashMmsi(mmsi: string): number {
  let hash = 0;
  for (let i = 0; i < mmsi.length; i++) {
    hash = (hash * 31 + mmsi.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Deterministic color for a vessel by MMSI. Colors repeat past 150 vessels. */
export function colorForMmsi(mmsi: string): string {
  return PING_PALETTE[hashMmsi(mmsi) % PING_PALETTE.length];
}
