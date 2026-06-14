import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { ANALYSES } from '../analyses_configs';
import type { LayerIconShape } from '../analyses_configs/types';
import squareIcon from '../assets/analytics_square.svg?raw';
import triangleIcon from '../assets/analytics_triangle.svg?raw';

const ICON_SVG: Record<LayerIconShape, string> = {
  square: squareIcon,
  triangle: triangleIcon,
};

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

/** "Show all paths" icon, matching the vessels-widget path button. */
function PathIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="5 17 12 10 19 5" />
      <circle cx="5" cy="17" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10" r="2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * One toggle row per map layer. The list is built entirely from the analyses'
 * `layers_config` — no layer is shown that isn't declared by a config. Layers
 * with `can_get_full_path` also get a path button that loads full paths for the
 * vessels involved in the job's events.
 */
export const LayersWidget = observer(function LayersWidget() {
  const { layers, event, ping } = useStores();
  const layerConfigs = ANALYSES.flatMap((analysis) => analysis.layers_config);

  // Unique vessels (MMSIs) involved in the current job's events.
  const jobMmsis = () => [
    ...new Set([...event.geofence, ...event.aisOff].map((e) => e.mmsi)),
  ];

  const toggleFullPaths = () => {
    if (ping.hasJobTracks) ping.clearJobTracks();
    else void ping.showJobTracks(jobMmsis());
  };

  return (
    <div className="layers-widget">
      <div className="layers-widget__title">Layers</div>

      {layerConfigs.length === 0 ? (
        <div className="layers-widget__empty">No layers</div>
      ) : (
        layerConfigs.map((layer) => (
          <div className="layer" key={layer.id}>
            <div className="layer__header">
              <span className="layer__leaf">
                {layer.type === 'ICON' && (
                  <LayerIcon svg={ICON_SVG[layer.icon]} color={layer.color} />
                )}
                <span className="layer__name">{layer.name}</span>
              </span>
              {layer.config?.can_get_full_path && (
                <button
                  type="button"
                  className={`layer__path${ping.hasJobTracks ? ' is-active' : ''}`}
                  title={ping.hasJobTracks ? 'Hide full paths' : 'Show full paths'}
                  aria-label={ping.hasJobTracks ? 'Hide full paths' : 'Show full paths'}
                  aria-pressed={ping.hasJobTracks}
                  onClick={toggleFullPaths}
                >
                  <PathIcon />
                </button>
              )}
              <Toggle
                on={layers.isLayerVisible(layer.id)}
                onChange={() => layers.toggleLayer(layer.id)}
                label={`Toggle ${layer.name} layer`}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
});
