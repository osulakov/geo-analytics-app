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
  if (!hasResults && !layers.deviceTracksVisible) return null;
  return (
    <div className="left-stack">
      {hasResults && <LayersWidget />}
      <VesselsWidget />
    </div>
  );
});
