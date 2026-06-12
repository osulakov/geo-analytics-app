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

/** Fetch geofence enter/exit events, optionally limited to a date range. */
export async function fetchGeofenceEvents(
  fromDate?: string,
  toDate?: string,
): Promise<MapEvent[]> {
  const params = new URLSearchParams();
  if (fromDate) params.set('from', `${fromDate}T00:00:00Z`);
  if (toDate) params.set('to', `${toDate}T23:59:59Z`);
  const query = params.toString();

  const response = await fetch(`/api/events/geofence${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch geofence events: ${response.status}`);
  }
  return (await response.json()) as MapEvent[];
}
