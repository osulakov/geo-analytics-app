import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing the total number of vessels in the DB. */
export const ShipCounter = observer(function ShipCounter() {
  const { vessel } = useStores();

  return (
    <div className="ship-counter">
      <span className="ship-counter__value">{vessel.vessels.length.toLocaleString()}</span>
      <span className="ship-counter__label">vessels</span>
    </div>
  );
});
