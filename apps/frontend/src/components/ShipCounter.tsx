import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing how many vessels are currently shown — matching the
 *  device-tracks layer: all static vessels when "all device tracks" is on, or
 *  the AOI-bounded job set otherwise (0 when no device tracks are shown). */
export const ShipCounter = observer(function ShipCounter() {
  const { vessel, ping, layers } = useStores();

  let count = 0;
  if (layers.deviceTracksVisible) {
    count = vessel.vessels.length;
  } else if (layers.isLayerVisible('device-tracks')) {
    count = new Set(ping.aoiPings.map((p) => p.mmsi)).size;
  }

  return (
    <div className="ship-counter">
      <span className="ship-counter__value">{count.toLocaleString()}</span>
      <span className="ship-counter__label">vessels</span>
    </div>
  );
});
