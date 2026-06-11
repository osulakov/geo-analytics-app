export interface StaticVesselInfo {
  /** Maritime Mobile Service Identity — unique vessel ID. */
  mmsi: string;
  /** IMO vessel number. */
  imo: string | null;
  vesselName: string;
  callsign: string | null;
  /** Country of registration. */
  flagState: string | null;
  /** Cargo, tanker, fishing, passenger, etc. */
  vesselType: string | null;
  /** Length in metres. */
  length: number | null;
  /** Beam in metres. */
  width: number | null;
  /** Reported draft in metres. */
  draft: number | null;
}

/** Fetch all rows from static_vessel_info via the dev API. */
export async function fetchStaticVesselInfo(): Promise<StaticVesselInfo[]> {
  const response = await fetch('/api/vessels');
  if (!response.ok) {
    throw new Error(`Failed to fetch vessels: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as StaticVesselInfo[];
}

/** Fetch a single vessel's static info by MMSI (null if not found). */
export async function fetchVesselByMmsi(mmsi: string): Promise<StaticVesselInfo | null> {
  const response = await fetch(`/api/vessels/${mmsi}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch vessel ${mmsi}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as StaticVesselInfo;
}
