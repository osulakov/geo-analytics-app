/** A map event. `details` is event-type-specific (dynamic) extra data. */
export interface MapEvent {
  mmsi: string;
  eventType: string;
  subtype: string | null;
  ts: string;
  lon: number;
  lat: number;
  details: Record<string, unknown> | null;
}

import { applyCap, type ViewportCap } from './pings';

/** Fetch geofence enter/exit events within an ISO datetime range + viewport. */
export async function fetchGeofenceEvents(
  fromIso?: string,
  toIso?: string,
  cap?: ViewportCap | null,
  signal?: AbortSignal,
): Promise<MapEvent[]> {
  const params = new URLSearchParams();
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);
  applyCap(params, cap);
  const query = params.toString();

  const response = await fetch(`/api/events/geofence${query ? `?${query}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch geofence events: ${response.status}`);
  }
  return (await response.json()) as MapEvent[];
}
