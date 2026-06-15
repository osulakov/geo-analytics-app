import { observer } from 'mobx-react-lite';

import { LayersWidget } from './LayersWidget';
import { VesselsWidget } from './VesselsWidget';
import { useStores } from '../stores/StoreContext';

/**
 * Second left-column: the Layers widget for a job's result events (only after a
 * run), and the Vessels widget — shown whenever there are job results OR the
 * global device-tracks layer (Data widget) is on.
 */
export const JobResultsColumn = observer(function JobResultsColumn() {
  const { analysis, layers } = useStores();
  const hasResults = analysis.lastResults.length > 0;

  // Widgets show per their own rules OR when an added analysis supports them.
  // Vessels also shows when the global device-tracks layer is on (Data widget),
  // even with no analysis added.
  const showLayers = hasResults || analysis.supportsWidget('layers');
  const showVessels =
    hasResults || layers.deviceTracksVisible || analysis.supportsWidget('vessels');

  if (!showLayers && !showVessels) return null;
  return (
    <div className="left-stack">
      {showLayers && <LayersWidget />}
      {showVessels && <VesselsWidget />}
    </div>
  );
});
