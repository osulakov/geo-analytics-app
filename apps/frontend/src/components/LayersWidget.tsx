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

/**
 * One toggle row per map layer. The list is built entirely from the analyses'
 * `layers_config` — no layer is shown that isn't declared by a config.
 */
export const LayersWidget = observer(function LayersWidget() {
  const { layers } = useStores();
  const layerConfigs = ANALYSES.flatMap((analysis) => analysis.layers_config);

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
