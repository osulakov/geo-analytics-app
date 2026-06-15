import { useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { aoisToWkt } from '../analyses_configs/wkt';
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
    // Drop any full paths from a previous job.
    ping.clearJobTracks();

    // If any run analysis declares an aoi_bounded device-tracks layer, fetch
    // device tracks for the selected AOIs only (separate from the global
    // device-tracks layer controlled by the Data widget).
    const aoiConfigs = analysis.addedConfigs.filter((config) =>
      config.layers_config.some((layer) => layer.config?.aoi_bounded),
    );
    if (aoiConfigs.length > 0) {
      // Scope the job's device tracks to the analyses' selected vessels (if any).
      const mmsis = [...new Set(aoiConfigs.flatMap((c) => analysis.getSettings(c.id).mmsis))];
      await ping.loadAoiDeviceTracks(aoisToWkt(aoi.aois), mmsis);
    } else {
      ping.clearAoiDeviceTracks();
    }

    layers.showAll();
  };

  return (
    <div className="run-job">
      <button type="button" className="run-job__button" disabled={disabled} onClick={handleRun}>
        {analysis.running ? 'Running…' : 'Run Job'}
      </button>

      {hasResults && (
        <button type="button" className="run-job__save" onClick={() => setSaveOpen(true)}>
          {analysis.fromSavedJob ? 'Save As' : 'Save Job'}
        </button>
      )}

      {saveOpen && <SaveJobModal onClose={() => setSaveOpen(false)} />}
    </div>
  );
});
