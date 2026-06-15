export interface MockVessel {
  mmsi: string;
  imo: string;
  vesselName: string;
  callsign: string;
  flagState: string;
  vesselType: string;
  length: number;
  width: number;
  draft: number;
}

export interface MockPing {
  ts: string;
  lon: number;
  lat: number;
  heading: number;
  speed: number;
}

/** Insert a mocked vessel + its device-track pings into the DB. */
export async function createMockDeviceTrack(
  vessel: MockVessel,
  pings: MockPing[],
): Promise<void> {
  const response = await fetch('/api/mock/device-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vessel, pings }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create mock device track: ${response.status}`);
  }
}
