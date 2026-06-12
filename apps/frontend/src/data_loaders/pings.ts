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

/** Visible spherical cap: a center (lon/lat) and radius in metres. */
export interface ViewportCap {
  lon: number;
  lat: number;
  radius: number;
}

/** Append ?lon&lat&radius for a viewport cap. */
export function applyCap(params: URLSearchParams, cap?: ViewportCap | null): void {
  if (!cap) return;
  params.set('lon', String(cap.lon));
  params.set('lat', String(cap.lat));
  params.set('radius', String(cap.radius));
}

/** Fetch a vessel's ordered track within an ISO datetime window. */
export async function fetchVesselTrack(
  mmsi: string,
  fromIso?: string,
  toIso?: string,
  signal?: AbortSignal,
): Promise<TrackPoint[]> {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  const query = params.toString();

  const response = await fetch(`/api/pings/track/${mmsi}${query ? `?${query}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch track for ${mmsi}: ${response.status}`);
  }
  return (await response.json()) as TrackPoint[];
}

/**
 * Fetch ALL pings within an ISO datetime range and optional viewport cap.
 * The client computes latest-per-vessel and time-window filtering in memory.
 */
export async function fetchAllPings(
  fromIso?: string,
  toIso?: string,
  cap?: ViewportCap | null,
  signal?: AbortSignal,
): Promise<LatestPing[]> {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  applyCap(params, cap);
  const query = params.toString();

  const response = await fetch(`/api/pings${query ? `?${query}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch pings: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as LatestPing[];
}
