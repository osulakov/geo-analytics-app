import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/** Top-right widget showing the number of loaded geofence events. */
export const EventCounter = observer(function EventCounter() {
  const { event } = useStores();

  return (
    <div className="event-counter">
      <span className="event-counter__value">{event.geofence.length.toLocaleString()}</span>
      <span className="event-counter__label">events</span>
    </div>
  );
});
