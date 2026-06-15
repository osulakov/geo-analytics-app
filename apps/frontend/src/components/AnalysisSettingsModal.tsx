import { useState } from 'react';
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

          <select
            className="analysis-settings__group-select"
            value=""
            onChange={(event) => {
              const g = group.groups.find((x) => String(x.id) === event.target.value);
              if (g) addMmsis(g.mmsis);
            }}
            aria-label="Add a vessel group"
          >
            <option value="">Add from vessel group…</option>
            {group.groups.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name} ({g.mmsis.length})
              </option>
            ))}
          </select>

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
