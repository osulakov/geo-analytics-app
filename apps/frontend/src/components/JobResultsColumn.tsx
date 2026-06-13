import { observer } from 'mobx-react-lite';

import { LayersWidget } from './LayersWidget';
import { useStores } from '../stores/StoreContext';

/**
 * Second left-column shown once a job has been run: the Layers widget for the
 * result events (all layers are turned on by the run).
 */
export const JobResultsColumn = observer(function JobResultsColumn() {
  const { analysis } = useStores();
  if (analysis.lastResults.length === 0) return null;
  return (
    <div className="left-stack">
      <LayersWidget />
    </div>
  );
});
