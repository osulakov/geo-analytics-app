import { useEffect, useState } from 'react';

import { fetchVesselByMmsi, type StaticVesselInfo } from '../api/vessels';

interface VesselModalProps {
  mmsi: string;
  onClose: () => void;
  onShowPath: (mmsi: string) => void;
  onAddToGroup: (mmsi: string) => void;
}

function formatMetres(value: number | null): string {
  return value === null ? '—' : `${value} m`;
}

/** Modal with a vessel's static info, plus "Show full path" / "Close". */
export function VesselModal({ mmsi, onClose, onShowPath, onAddToGroup }: VesselModalProps) {
  const [vessel, setVessel] = useState<StaticVesselInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetchVesselByMmsi(mmsi)
      .then((data) => {
        if (active) setVessel(data);
      })
      .catch((error) => console.error(`Failed to fetch vessel ${mmsi}:`, error));
    return () => {
      active = false;
    };
  }, [mmsi]);

  return (
    <div className="vessel-modal__overlay" onClick={onClose}>
      <div
        className="vessel-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="vessel-modal__x" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="vessel-modal__title">{vessel ? vessel.vesselName : `${mmsi}…`}</div>

        {vessel && (
          <dl className="vessel-modal__list">
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
        )}

        <div className="vessel-modal__actions">
          <button
            type="button"
            className="vessel-modal__path"
            onClick={() => onShowPath(mmsi)}
          >
            Show full path
          </button>
          <button
            type="button"
            className="vessel-modal__group"
            onClick={() => onAddToGroup(mmsi)}
          >
            Add to group
          </button>
        </div>
      </div>
    </div>
  );
}
