import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import squareIcon from '../assets/analytics_square.svg?raw';
import triangleIcon from '../assets/analytics_triangle.svg?raw';

// Legend colors: device tracks → yellow triangle, geofence → red square
// (matching the red geofence marker on the map).
const DEVICE_TRACKS_COLOR = '#facc15';
const GEOFENCE_COLOR = '#ef4444';

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

/** Colored layer legend icon (recolors the SVG's currentColor stroke via CSS). */
function LayerIcon({ svg, color }: { svg: string; color: string }) {
  return (
    <span
      className="layer__icon"
      style={{ color }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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
            <LayerIcon svg={triangleIcon} color={DEVICE_TRACKS_COLOR} />
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
          <span className="layer__leaf">
            <LayerIcon svg={squareIcon} color={GEOFENCE_COLOR} />
            <span className="layer__name">Geofence (Enter/Exit)</span>
          </span>
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
