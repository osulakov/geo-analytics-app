import { useEffect, useState } from "react";

import { fetchVesselByMmsi, type StaticVesselInfo } from "../data_loaders/vessels";

// Cache static info per MMSI so repeated hovers don't re-fetch.
const cache = new Map<string, StaticVesselInfo | null>();

interface VesselTooltipProps {
  mmsi: string;
  x: number;
  y: number;
  ts: string;
  heading: number | null;
}

function formatMetres(value: number | null): string {
  return value === null ? "—" : `${value} m`;
}

function formatHeading(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}°`;
}

/** Format an ISO timestamp as `YYYY-MM-DD HH:MM` (UTC). */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** Tooltip showing a vessel's static info, fetched dynamically by MMSI. */
export function VesselTooltip({ mmsi, x, y, ts, heading }: VesselTooltipProps) {
  const [vessel, setVessel] = useState<StaticVesselInfo | null>(
    () => cache.get(mmsi) ?? null,
  );

  useEffect(() => {
    if (cache.has(mmsi)) {
      setVessel(cache.get(mmsi) ?? null);
      return;
    }
    let active = true;
    fetchVesselByMmsi(mmsi)
      .then((data) => {
        cache.set(mmsi, data);
        if (active) setVessel(data);
      })
      .catch((error) =>
        console.error(`Failed to fetch vessel ${mmsi}:`, error),
      );
    return () => {
      active = false;
    };
  }, [mmsi]);

  return (
    <div className="vessel-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="vessel-tooltip__title">
        {vessel ? vessel.vesselName : `${mmsi}…`}
      </div>
      <dl className="vessel-tooltip__list">
        {vessel && (
          <>
            <div>
              <dt>MMSI</dt>
              <dd>{vessel.mmsi}</dd>
            </div>
            <div>
              <dt>IMO</dt>
              <dd>{vessel.imo ?? "—"}</dd>
            </div>
            <div>
              <dt>Callsign</dt>
              <dd>{vessel.callsign ?? "—"}</dd>
            </div>
            <div>
              <dt>Flag</dt>
              <dd>{vessel.flagState ?? "—"}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{vessel.vesselType ?? "—"}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{formatMetres(vessel.length)}</dd>
            </div>
            <div>
              <dt>Width</dt>
              <dd>{formatMetres(vessel.width)}</dd>
            </div>
            <div>
              <dt>Draft</dt>
              <dd>{formatMetres(vessel.draft)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Heading</dt>
          <dd>{formatHeading(heading)}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatTimestamp(ts)}</dd>
        </div>
      </dl>
    </div>
  );
}
