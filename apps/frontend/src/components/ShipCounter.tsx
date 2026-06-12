import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing how many vessels have pings in the global date
 *  range (distinct MMSIs in ais_pings, not the time-slider window). */
export const ShipCounter = observer(function ShipCounter() {
  const { ping } = useStores();

  return (
    <div className="ship-counter">
      <span className="ship-counter__value">{ping.activeVesselCount.toLocaleString()}</span>
      <span className="ship-counter__label">vessels</span>
    </div>
  );
});
