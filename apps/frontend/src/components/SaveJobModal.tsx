import { useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';

import { aoisToWkt } from '../analyses_configs/wkt';
import { useStores } from '../stores/StoreContext';

/** Summary + name modal for saving the just-run job (and its events) to the DB. */
export const SaveJobModal = observer(function SaveJobModal({ onClose }: { onClose: () => void }) {
  const { ping, aoi, analysis, job } = useStores();
  const [name, setName] = useState('');

  const totalEvents = analysis.lastResults.reduce((sum, r) => sum + r.rows.length, 0);
  const analysisNames = analysis.addedConfigs.map((a) => a.name).join(', ') || '—';
  const aoiNames = aoi.aois.length > 0 ? aoi.aois.map((a) => a.name).join(', ') : 'Global (whole world)';

  const handleSave = async () => {
    const ok = await job.save({
      name,
      // Hardcoded to the run analysis for now (single-analysis flow).
      analysisConfigId: analysis.addedConfigs[0]?.id ?? 'geofence-enter-exit',
      aoiWkt: aoisToWkt(aoi.aois),
      fromIso: ping.rangeStartIso ?? null,
      toIso: ping.rangeEndIso ?? null,
      eventCount: totalEvents,
    });
    if (ok) onClose();
  };

  return createPortal(
    <div className="confirm-dialog__overlay" onClick={onClose}>
      <div className="save-job-modal" onClick={(event) => event.stopPropagation()}>
        <div className="save-job-modal__title">Save job</div>

        <div className="save-job-modal__summary">
          <div>
            <span>Date range</span>
            <span>
              {ping.fromDate} → {ping.toDate}
            </span>
          </div>
          <div>
            <span>AOIs</span>
            <span>{aoiNames}</span>
          </div>
          <div>
            <span>Analysis</span>
            <span>{analysisNames}</span>
          </div>
          <div>
            <span>Events</span>
            <span>{totalEvents}</span>
          </div>
        </div>

        <label className="save-job-modal__field">
          <span>Job name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Hormuz crossings — June"
            autoFocus
          />
        </label>

        {job.error && <div className="save-job-modal__error">{job.error}</div>}

        <div className="save-job-modal__actions">
          <button type="button" className="save-job-modal__cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="save-job-modal__save"
            disabled={!name.trim() || job.saving}
            onClick={handleSave}
          >
            {job.saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
});
