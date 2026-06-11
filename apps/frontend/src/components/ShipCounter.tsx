import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing how many ships are currently plotted. */
export const ShipCounter = observer(function ShipCounter() {
  const { ping } = useStores();

  return (
    <div className="ship-counter">
      <span className="ship-counter__value">{ping.pings.length.toLocaleString()}</span>
      <span className="ship-counter__label">vessels</span>
    </div>
  );
});
