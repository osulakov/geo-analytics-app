import { useEffect, useState } from 'react';

import { fetchVesselByMmsi, type StaticVesselInfo } from '../api/vessels';

// Cache static info per MMSI so repeated hovers don't re-fetch.
const cache = new Map<string, StaticVesselInfo | null>();

interface VesselTooltipProps {
  mmsi: string;
  x: number;
  y: number;
}

function formatMetres(value: number | null): string {
  return value === null ? '—' : `${value} m`;
}

/** Tooltip showing a vessel's static info, fetched dynamically by MMSI. */
export function VesselTooltip({ mmsi, x, y }: VesselTooltipProps) {
  const [vessel, setVessel] = useState<StaticVesselInfo | null>(() => cache.get(mmsi) ?? null);

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
      .catch((error) => console.error(`Failed to fetch vessel ${mmsi}:`, error));
    return () => {
      active = false;
    };
  }, [mmsi]);

  return (
    <div className="vessel-tooltip" style={{ left: x + 14, top: y + 14 }}>
      {vessel ? (
        <>
          <div className="vessel-tooltip__title">{vessel.vesselName}</div>
          <dl className="vessel-tooltip__list">
            <div>
              <dt>MMSI</dt>
              <dd>{vessel.mmsi}</dd>
            </div>
            <div>
              <dt>IMO</dt>
              <dd>{vessel.imo ?? '—'}</dd>
            </div>
            <div>
              <dt>Callsign</dt>
              <dd>{vessel.callsign ?? '—'}</dd>
            </div>
            <div>
              <dt>Flag</dt>
              <dd>{vessel.flagState ?? '—'}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{vessel.vesselType ?? '—'}</dd>
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
          </dl>
        </>
      ) : (
        <div className="vessel-tooltip__title">{mmsi}…</div>
      )}
    </div>
  );
}
