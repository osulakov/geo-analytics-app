import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { SaveJobModal } from './SaveJobModal';

/**
 * Run Job widget: runs the selected (Added) analyses against the DB, scoped to
 * the Added AOIs (or the whole world if none) and the global date range. After a
 * run, all layers are turned on and a Save Job action appears.
 */
export const RunJobWidget = observer(function RunJobWidget() {
  const { analysis, aoi, ping, layers, event } = useStores();
  const [saveOpen, setSaveOpen] = useState(false);

  const disabled = analysis.running || analysis.addedConfigs.length === 0;
  const hasResults = analysis.lastResults.length > 0;

  const handleRun = async () => {
    await analysis.run(aoi.aois, ping.rangeStartIso ?? null, ping.rangeEndIso ?? null);
    // Show only the job's produced events on the map (no DB fetch).
    event.setJobEvents(analysis.resultEvents);
    layers.showAll();
  };

  return (
    <div className="run-job">
      <button type="button" className="run-job__button" disabled={disabled} onClick={handleRun}>
        {analysis.running ? 'Running…' : 'Run Job'}
      </button>

      {hasResults && (
        <button type="button" className="run-job__save" onClick={() => setSaveOpen(true)}>
          Save Job
        </button>
      )}

      {saveOpen && <SaveJobModal onClose={() => setSaveOpen(false)} />}
    </div>
  );
});
