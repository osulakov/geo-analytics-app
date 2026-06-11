import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { fetchVesselByMmsi, type StaticVesselInfo } from '../api/vessels';
import { useStores } from '../stores/StoreContext';

interface VesselModalProps {
  mmsi: string;
  onClose: () => void;
  onShowPath: (mmsi: string) => void;
}

function formatMetres(value: number | null): string {
  return value === null ? '—' : `${value} m`;
}

/** Modal with a vessel's static info, "Show full path", and group actions. */
export const VesselModal = observer(function VesselModal({
  mmsi,
  onClose,
  onShowPath,
}: VesselModalProps) {
  const { group } = useStores();
  const [vessel, setVessel] = useState<StaticVesselInfo | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

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

  // Load groups when the group panel is opened.
  useEffect(() => {
    if (groupOpen) void group.loadGroups();
  }, [groupOpen, group]);

  const handleCreate = () => {
    const name = newGroupName.trim();
    if (!name) return;
    void group.createGroup(name, mmsi);
    setNewGroupName('');
  };

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
            className={`vessel-modal__group${groupOpen ? ' is-active' : ''}`}
            aria-expanded={groupOpen}
            onClick={() => setGroupOpen((value) => !value)}
          >
            Add to group
          </button>
        </div>

        {groupOpen && (
          <div className="vessel-modal__groups">
            <div className="vessel-modal__group-create">
              <input
                type="text"
                value={newGroupName}
                placeholder="New group name"
                onChange={(event) => setNewGroupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreate();
                }}
              />
              <button type="button" onClick={handleCreate} disabled={!newGroupName.trim()}>
                Save
              </button>
            </div>

            <div className="vessel-modal__group-list">
              {group.groups.length === 0 ? (
                <div className="vessel-modal__group-empty">No groups yet</div>
              ) : (
                group.groups.map((g) => {
                  const inGroup = g.mmsis.includes(mmsi);
                  return (
                    <div key={g.id} className="vessel-modal__group-item">
                      <span className="vessel-modal__group-name">
                        {g.name} <span className="vessel-modal__group-count">({g.mmsis.length})</span>
                      </span>
                      <button
                        type="button"
                        disabled={inGroup}
                        onClick={() => void group.addMember(g.id, mmsi)}
                      >
                        {inGroup ? 'Added' : 'Add'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
