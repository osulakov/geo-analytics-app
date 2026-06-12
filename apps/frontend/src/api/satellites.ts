export interface Satellite {
  /** Unique satellite name, e.g. MAXAR_001. */
  name: string;
  /** Constellation the satellite belongs to (MAXAR, PLANET, …). */
  constellation: string;
  /** Orbit altitude above the mean radius, in km. */
  altitudeKm: number | null;
  /** Orbital inclination, in degrees. */
  inclinationDeg: number | null;
  /** Time for one orbit, in minutes. */
  orbitalPeriodMin: number | null;
  /** Imaging swath width on the ground, in km. */
  swathWidthKm: number | null;
  /** Orbital velocity, in km/s. */
  groundVelocityKmSec: number | null;
  /** Sensor off-nadir look angle, in degrees. */
  lookAngleDeg: number | null;
  /** Right ascension of the ascending node (orbital plane), in degrees. */
  raanDeg: number | null;
  /** Phase within the orbit, in degrees. */
  meanAnomalyDeg: number | null;
}

/** Fetch all rows from the satellites table via the dev API. */
export async function fetchSatellites(): Promise<Satellite[]> {
  const response = await fetch('/api/satellites');
  if (!response.ok) {
    throw new Error(`Failed to fetch satellites: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Satellite[];
}
