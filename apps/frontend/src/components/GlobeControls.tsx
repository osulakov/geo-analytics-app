import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

// Playback speeds for the spin + satellite motion.
const SPEEDS: { value: number; label: string }[] = [
  { value: 1, label: 'Normal' },
  { value: 10, label: '›› 10×' },
  { value: 50, label: '››› 50×' },
  { value: 100, label: '›››› 100×' },
];

/**
 * Small control cluster, bottom-right of the screen: zoom in/out, pause/resume
 * the auto-rotation, and reset the view.
 */
export const GlobeControls = observer(function GlobeControls() {
  const { globe } = useStores();
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);

  // Close the speed menu on any click outside the play control.
  useEffect(() => {
    if (!speedMenuOpen) return;
    const close = () => setSpeedMenuOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [speedMenuOpen]);

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
        className={globe.showEez ? 'globe-controls__label active' : 'globe-controls__label'}
        title={globe.showEez ? 'Hide EEZ boundaries' : 'Show EEZ boundaries'}
        aria-label={globe.showEez ? 'Hide EEZ boundaries' : 'Show EEZ boundaries'}
        aria-pressed={globe.showEez}
        onClick={() => globe.toggleEez()}
      >
        EEZ
      </button>
      <div className="globe-controls__play" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={globe.spinning ? 'globe-controls__play-speed' : undefined}
          title={globe.spinning ? 'Pause rotation' : 'Resume rotation'}
          aria-label={globe.spinning ? 'Pause rotation' : 'Resume rotation'}
          onClick={() => globe.toggleSpinning()}
        >
          {globe.spinning ? `${globe.speed}×` : '▶'}
        </button>
        <button
          type="button"
          className="globe-controls__play-chevron"
          title={`Playback speed (${SPEEDS.find((s) => s.value === globe.speed)?.label ?? 'Normal'})`}
          aria-label="Playback speed"
          aria-haspopup="menu"
          aria-expanded={speedMenuOpen}
          onClick={() => setSpeedMenuOpen((o) => !o)}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {speedMenuOpen && (
          <div className="globe-controls__speed-menu" role="menu">
            {SPEEDS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="menuitemradio"
                aria-checked={globe.speed === s.value}
                className={globe.speed === s.value ? 'is-active' : undefined}
                onClick={() => {
                  globe.setSpeed(s.value);
                  setSpeedMenuOpen(false);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
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
