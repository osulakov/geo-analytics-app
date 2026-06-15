import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { aoisToWkt } from '../analyses_configs/wkt';
import { useApplyJobs } from './useApplyJobs';
import { SaveJobModal } from './SaveJobModal';

/**
 * Run Job widget. Running adds/updates a job in the applied set and re-combines
 * the map: if a job is being edited (loaded from the applied list) it's updated
 * in place; otherwise the run is added as a new draft alongside the applied
 * jobs. Save persists the current job; Discard wipes everything.
 */
export const RunJobWidget = observer(function RunJobWidget() {
  const { analysis, aoi, ping, layers, event, job } = useStores();
  const applyJobs = useApplyJobs();
  const [saveOpen, setSaveOpen] = useState(false);

  const disabled = analysis.running || analysis.addedConfigs.length === 0;
  const hasResults = analysis.lastResults.length > 0;
  const canDiscard =
    hasResults || job.applied.length > 0 || analysis.added.length > 0 || aoi.aois.length > 0;

  // Editing a saved job → "Save As"; a fresh/draft job → "Save Job".
  const editingSaved = job.editingId !== null && !job.editingId.startsWith('draft-');

  const handleDiscard = () => {
    job.clearApplied();
    analysis.reset();
    aoi.setFromWkt(null);
    event.clearJob();
    ping.clearAoiDeviceTracks();
    ping.clearJobTracks();
    layers.clearLayers();
  };

  const handleRun = async () => {
    const configId = analysis.addedConfigs[0]?.id;
    if (!configId) return;
    const base = {
      analysisConfigId: configId,
      analysisConfig: analysis.getSettings(configId),
      aoiWkt: aoisToWkt(aoi.aois),
      fromIso: ping.rangeStartIso ?? null,
      toIso: ping.rangeEndIso ?? null,
      eventCount: 0,
    };
    if (job.editingId) {
      // Re-run the edited job in place (keeps the other applied jobs).
      job.updateApplied(job.editingId, base);
    } else {
      // Fresh job: add a draft alongside the applied jobs.
      const id = `draft-${Date.now()}`;
      job.apply({ id, name: 'New job', createdAt: '', ...base });
      job.setEditing(id);
    }
    await applyJobs(job.applied);
  };

  return (
    <div className="run-job">
      <button type="button" className="run-job__button" disabled={disabled} onClick={handleRun}>
        {analysis.running ? 'Running…' : job.editingId ? 'Re-run' : 'Run Job'}
      </button>

      {hasResults && (
        <button type="button" className="run-job__save" onClick={() => setSaveOpen(true)}>
          {editingSaved ? 'Save As' : 'Save Job'}
        </button>
      )}

      {canDiscard && (
        <button type="button" className="run-job__discard" onClick={handleDiscard}>
          Discard
        </button>
      )}

      {saveOpen && <SaveJobModal onClose={() => setSaveOpen(false)} />}
    </div>
  );
});
