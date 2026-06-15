import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';

import type { AnalysisConfig, AnalysisSettings } from '../analyses_configs';
import { useStores } from '../stores/StoreContext';

function Checkbox({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <label className="analysis-settings__check-row">
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
      <span>{label}</span>
    </label>
  );
}

/** Settings modal for an analysis: detection toggles + vessel/group scoping. */
export const AnalysisSettingsModal = observer(function AnalysisSettingsModal({
  config,
  onClose,
}: {
  config: AnalysisConfig;
  onClose: () => void;
}) {
  const { analysis, vessel, group } = useStores();
  const [vesselQuery, setVesselQuery] = useState('');
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  // Close the group dropdown on any click outside it.
  useEffect(() => {
    if (!groupMenuOpen) return;
    const close = (e: PointerEvent) => {
      if (!groupRef.current?.contains(e.target as Node)) setGroupMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [groupMenuOpen]);

  const settings = analysis.getSettings(config.id);
  const set = (patch: Partial<AnalysisSettings>) => analysis.setSettings(config.id, patch);

  const addMmsis = (mmsis: string[]) => {
    set({ mmsis: [...new Set([...settings.mmsis, ...mmsis])] });
  };
  const removeMmsi = (mmsi: string) => {
    set({ mmsis: settings.mmsis.filter((m) => m !== mmsi) });
  };

  const q = vesselQuery.trim().toLowerCase();
  const matches = q
    ? vessel.vessels
        .filter((v) => !settings.mmsis.includes(v.mmsi))
        .filter((v) =>
          `${v.mmsi} ${v.vesselName ?? ''} ${v.flagState ?? ''} ${v.vesselType ?? ''}`
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 8)
    : [];

  const selected = settings.mmsis.map(
    (mmsi) => vessel.vessels.find((v) => v.mmsi === mmsi) ?? { mmsi, vesselName: mmsi },
  );

  return createPortal(
    <div className="confirm-dialog__overlay" onClick={onClose}>
      <div className="analysis-settings" onClick={(event) => event.stopPropagation()}>
        <div className="analysis-settings__header">
          <span className="analysis-settings__title">{config.name}</span>
          <button
            type="button"
            className="analysis-settings__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <p className="analysis-settings__desc">{config.description}</p>

        <div className="analysis-settings__section">
          <div className="analysis-settings__section-label">Detection</div>
          <Checkbox
            on={settings.detectEezCrossing}
            onChange={() => set({ detectEezCrossing: !settings.detectEezCrossing })}
            label="Detect EEZ crossing"
          />
          <Checkbox
            on={settings.detectAoiCrossing}
            onChange={() => set({ detectAoiCrossing: !settings.detectAoiCrossing })}
            label="Detect AOI boundaries crossing"
          />
        </div>

        <div className="analysis-settings__section">
          <div className="analysis-settings__section-label">Vessels</div>

          <div className="analysis-settings__vessel-search">
            <input
              type="text"
              value={vesselQuery}
              onChange={(event) => setVesselQuery(event.target.value)}
              placeholder="Search vessels to add"
              aria-label="Search vessels"
            />
            {matches.length > 0 && (
              <div className="analysis-settings__dropdown">
                {matches.map((v) => (
                  <button
                    key={v.mmsi}
                    type="button"
                    className="analysis-settings__option"
                    onClick={() => {
                      addMmsis([v.mmsi]);
                      setVesselQuery('');
                    }}
                  >
                    <span className="analysis-settings__option-name">{v.vesselName ?? v.mmsi}</span>
                    <span className="analysis-settings__option-meta">
                      {v.mmsi} · {v.flagState ?? '—'} · {v.vesselType ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="analysis-settings__group" ref={groupRef}>
            <button
              type="button"
              className="analysis-settings__group-trigger"
              aria-haspopup="listbox"
              aria-expanded={groupMenuOpen}
              onClick={() => setGroupMenuOpen((o) => !o)}
            >
              <span>Add from vessel group…</span>
              <svg
                className={`analysis-settings__group-chevron${groupMenuOpen ? ' is-open' : ''}`}
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
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {groupMenuOpen && (
              <div className="analysis-settings__dropdown" role="listbox">
                {group.groups.length === 0 ? (
                  <div className="analysis-settings__hint">No vessel groups yet</div>
                ) : (
                  group.groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="option"
                      className="analysis-settings__option"
                      onClick={() => {
                        addMmsis(g.mmsis);
                        setGroupMenuOpen(false);
                      }}
                    >
                      <span className="analysis-settings__option-name">{g.name}</span>
                      <span className="analysis-settings__option-meta">{g.mmsis.length} vessels</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selected.length > 0 ? (
            <div className="analysis-settings__chips">
              {selected.map((v) => (
                <span key={v.mmsi} className="analysis-settings__chip">
                  {v.vesselName ?? v.mmsi}
                  <button
                    type="button"
                    aria-label={`Remove ${v.mmsi}`}
                    onClick={() => removeMmsi(v.mmsi)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="analysis-settings__hint">All vessels (none selected)</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});
