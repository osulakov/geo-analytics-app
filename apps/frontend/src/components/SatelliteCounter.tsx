import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing the total number of satellites in the DB. */
export const SatelliteCounter = observer(function SatelliteCounter() {
  const { satellite } = useStores();

  return (
    <div className="satellite-counter">
      <span className="satellite-counter__value">
        {satellite.satellites.length.toLocaleString()}
      </span>
      <span className="satellite-counter__label">satellites</span>
    </div>
  );
});
