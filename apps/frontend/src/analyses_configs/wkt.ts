import type { Aoi } from '../stores/AoiStore';

/** A closed WKT ring string ("lon lat, lon lat, …, lon0 lat0") for a polygon. */
function ringText(coordinates: [number, number][]): string {
  const ring = [...coordinates, coordinates[0]];
  return ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
}

/**
 * Build a WKT geometry (WGS84) covering the given AOIs: a POLYGON for one, a
 * MULTIPOLYGON for several. Returns null when there are no usable AOIs (→ the
 * analysis runs globally).
 */
export function aoisToWkt(aois: Aoi[]): string | null {
  const valid = aois.filter((aoi) => aoi.coordinates.length >= 3);
  if (valid.length === 0) return null;
  if (valid.length === 1) return `POLYGON((${ringText(valid[0].coordinates)}))`;
  return `MULTIPOLYGON(${valid.map((aoi) => `((${ringText(aoi.coordinates)}))`).join(', ')})`;
}
