export interface LatestPing {
  mmsi: string;
  /** ISO timestamp of the ping. */
  ts: string;
  lon: number;
  lat: number;
  heading: number | null;
}

export interface TrackPoint {
  ts: string;
  lon: number;
  lat: number;
  heading: number | null;
}

/** Fetch a vessel's ordered track, optionally limited to a date range. */
export async function fetchVesselTrack(
  mmsi: string,
  fromDate?: string,
  toDate?: string,
): Promise<TrackPoint[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set('from', `${fromDate}T00:00:00Z`);
  if (toDate) params.set('to', `${toDate}T23:59:59Z`);
  const query = params.toString();

  const response = await fetch(`/api/pings/track/${mmsi}${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch track for ${mmsi}: ${response.status}`);
  }
  return (await response.json()) as TrackPoint[];
}

/**
 * Fetch the most recent ping per vessel, optionally limited to a date range.
 * `fromDate` / `toDate` are `YYYY-MM-DD`; the range is inclusive of both days.
 */
export async function fetchLatestPings(
  fromDate?: string,
  toDate?: string,
): Promise<LatestPing[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set('from', `${fromDate}T00:00:00Z`);
  if (toDate) params.set('to', `${toDate}T23:59:59Z`);
  const query = params.toString();

  const response = await fetch(`/api/pings/latest${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pings: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as LatestPing[];
}
