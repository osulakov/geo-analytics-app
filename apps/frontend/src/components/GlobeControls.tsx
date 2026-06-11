import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/**
 * Small control cluster, bottom-right of the screen: zoom in/out, pause/resume
 * the auto-rotation, and reset the view.
 */
export const GlobeControls = observer(function GlobeControls() {
  const { globe } = useStores();

  return (
    <div className="globe-controls">
      <div className="globe-controls__zoom" title="Current zoom level">
        {globe.zoom.toFixed(1)}×
      </div>
      <button
        type="button"
        title="Zoom in"
        aria-label="Zoom in"
        onClick={() => globe.zoomIn()}
        disabled={!globe.canZoomIn}
      >
        +
      </button>
      <button
        type="button"
        title="Zoom out"
        aria-label="Zoom out"
        onClick={() => globe.zoomOut()}
        disabled={!globe.canZoomOut}
      >
        −
      </button>
      <button
        type="button"
        className={globe.showGraticule ? 'active' : undefined}
        title={globe.showGraticule ? 'Hide grid' : 'Show grid'}
        aria-label={globe.showGraticule ? 'Hide grid' : 'Show grid'}
        aria-pressed={globe.showGraticule}
        onClick={() => globe.toggleGraticule()}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="4.5" y1="7" x2="19.5" y2="7" />
          <line x1="4.5" y1="17" x2="19.5" y2="17" />
        </svg>
      </button>
      <button
        type="button"
        title={globe.spinning ? 'Pause rotation' : 'Resume rotation'}
        aria-label={globe.spinning ? 'Pause rotation' : 'Resume rotation'}
        onClick={() => globe.toggleSpinning()}
      >
        {globe.spinning ? '❚❚' : '▶'}
      </button>
      <button
        type="button"
        title="Reset view"
        aria-label="Reset view"
        onClick={() => globe.resetView()}
      >
        ⟳
      </button>
    </div>
  );
});
