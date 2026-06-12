import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

interface ToggleProps {
  on: boolean;
  onChange: () => void;
  label: string;
}

function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      className={`box-checkbox${on ? ' is-checked' : ''}`}
      onClick={onChange}
    >
      <span className="box-checkbox__fill" />
    </button>
  );
}

/** Toggles for all map layers. Currently: Device tracks → pings sublayer. */
export const LayersWidget = observer(function LayersWidget() {
  const { layers } = useStores();

  return (
    <div className="layers-widget">
      <div className="layers-widget__title">Layers</div>

      <div className="layer">
        <div className="layer__header">
          <button
            type="button"
            className="layer__expand"
            aria-expanded={layers.deviceTracksExpanded}
            onClick={() => layers.toggleDeviceTracksExpanded()}
          >
            <svg
              className={`layer__chevron${layers.deviceTracksExpanded ? ' is-open' : ''}`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span className="layer__name">Device tracks</span>
          </button>
          <Toggle
            on={layers.deviceTracksVisible}
            onChange={() => layers.toggleDeviceTracks()}
            label="Toggle Device tracks layer"
          />
        </div>

        {layers.deviceTracksExpanded && (
          <div className="layer__sublayers">
            <div className="sublayer">
              <span className="sublayer__name">Pings</span>
              <Toggle
                on={layers.pingsVisible}
                onChange={() => layers.togglePings()}
                label="Toggle pings sublayer"
              />
            </div>
          </div>
        )}
      </div>

      <div className="layer">
        <div className="layer__header">
          <span className="layer__name layer__name--leaf">Geofence (Enter/Exit)</span>
          <Toggle
            on={layers.geofenceVisible}
            onChange={() => layers.toggleGeofence()}
            label="Toggle Geofence events layer"
          />
        </div>
      </div>
    </div>
  );
});
