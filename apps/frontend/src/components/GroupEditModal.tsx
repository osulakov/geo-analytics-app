import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';

import type { VesselGroup } from '../api/groups';
import { useStores } from '../stores/StoreContext';
import { colorForMmsi } from '../utils/colorMap';

interface GroupEditModalProps {
  group: VesselGroup;
  onClose: () => void;
}

/** Edit a group's members: remove vessels, then Save. */
export const GroupEditModal = observer(function GroupEditModal({
  group: target,
  onClose,
}: GroupEditModalProps) {
  const { group, vessel } = useStores();
  const [mmsis, setMmsis] = useState<string[]>(target.mmsis);

  const nameByMmsi = useMemo(
    () => new Map(vessel.vessels.map((v) => [v.mmsi, v.vesselName])),
    [vessel.vessels],
  );

  const remove = (mmsi: string) => setMmsis((list) => list.filter((m) => m !== mmsi));

  const handleSave = () => {
    void group.updateMembers(target.id, mmsis);
    onClose();
  };

  return createPortal(
    <div className="group-edit__overlay" onClick={onClose}>
      <div
        className="group-edit"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="group-edit__x" type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>

        <div className="group-edit__title">{target.name}</div>

        <div className="group-edit__list">
          {mmsis.length === 0 ? (
            <div className="group-edit__empty">No vessels in this group</div>
          ) : (
            mmsis.map((m) => (
              <div key={m} className="group-edit__item">
                <span className="group-edit__color" style={{ background: colorForMmsi(m) }} />
                <div className="group-edit__info">
                  <div className="group-edit__name">{nameByMmsi.get(m) ?? m}</div>
                  <div className="group-edit__mmsi">{m}</div>
                </div>
                <button
                  type="button"
                  className="group-edit__remove"
                  aria-label="Remove vessel"
                  onClick={() => remove(m)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <div className="group-edit__actions">
          <button type="button" className="group-edit__cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="group-edit__save" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
