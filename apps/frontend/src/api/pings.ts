export interface LatestPing {
  mmsi: string;
  /** ISO timestamp of the ping. */
  ts: string;
  lon: number;
  lat: number;
  heading: number | null;
}

/** Fetch the most recent ping for every vessel. */
export async function fetchLatestPings(): Promise<LatestPing[]> {
  const response = await fetch('/api/pings/latest');
  if (!response.ok) {
    throw new Error(`Failed to fetch pings: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as LatestPing[];
}
