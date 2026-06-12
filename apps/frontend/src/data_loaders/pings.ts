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

/** Visible spherical cap: a center (lon/lat) and radius in metres, plus an
 *  optional zoom-based sampling bucket (0–100; <100 decimates vessels). */
export interface ViewportCap {
  lon: number;
  lat: number;
  radius: number;
  maxBucket?: number;
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

/** Fetch the single most recent ping for one vessel (null if none in range). */
export async function fetchLatestPing(
  mmsi: string,
  fromIso?: string,
  toIso?: string,
  signal?: AbortSignal,
): Promise<LatestPing | null> {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  const query = params.toString();

  const response = await fetch(`/api/pings/latest/${mmsi}${query ? `?${query}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch latest ping for ${mmsi}: ${response.status}`);
  }
  return (await response.json()) as LatestPing | null;
}

/** Count of distinct vessels with any ping in the given date range. */
export async function fetchActiveVesselCount(
  fromIso?: string,
  toIso?: string,
  signal?: AbortSignal,
): Promise<number> {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  const query = params.toString();

  const response = await fetch(`/api/pings/count${query ? `?${query}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch vessel count: ${response.status}`);
  }
  const data = (await response.json()) as { count: number };
  return data.count;
}

export interface PingQuery {
  fromIso?: string;
  toIso?: string;
  /** Viewport cap (+ optional zoom-based decimation). Ignored if `mmsis` set. */
  cap?: ViewportCap | null;
  /** Explicit vessel list (group filter): fetch exactly these, no cap/decimation. */
  mmsis?: string[] | null;
}

/**
 * Fetch ALL pings (all timestamps) within a range, scoped either to a viewport
 * cap (with optional zoom decimation) or to an explicit MMSI list. The client
 * computes latest-per-vessel and time-window filtering in memory.
 */
export async function fetchAllPings(query: PingQuery, signal?: AbortSignal): Promise<LatestPing[]> {
  const params = new URLSearchParams();
  if (query.fromIso) params.set('from', query.fromIso);
  if (query.toIso) params.set('to', query.toIso);

  if (query.mmsis && query.mmsis.length > 0) {
    // Group filter: fetch every member, regardless of viewport or sampling.
    params.set('mmsis', query.mmsis.join(','));
  } else if (query.cap) {
    applyCap(params, query.cap);
    if (query.cap.maxBucket != null && query.cap.maxBucket < 100) {
      params.set('bucket', String(query.cap.maxBucket));
    }
  }

  const qs = params.toString();
  const response = await fetch(`/api/pings${qs ? `?${qs}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch pings: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as LatestPing[];
}
