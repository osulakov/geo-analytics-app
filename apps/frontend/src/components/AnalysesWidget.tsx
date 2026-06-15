import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';

import { ANALYSES, type AnalysisConfig } from '../analyses_configs';
import { AnalysisSettingsModal } from './AnalysisSettingsModal';
import { useStores } from '../stores/StoreContext';

/**
 * Analyses widget. Collapsed by default (title + search); expands on the
 * chevron or when typing. Shows an "Added" working set on top and the
 * searchable "Library" of available analyses below. The Added set feeds Run Job.
 */
export const AnalysesWidget = observer(function AnalysesWidget() {
  const { analysis } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [settingsConfig, setSettingsConfig] = useState<AnalysisConfig | null>(null);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value && !expanded) setExpanded(true);
  };

  const isAdded = (id: string) => analysis.isAdded(id);
  const addToAdded = (id: string) => analysis.add(id);
  const removeFromAdded = (id: string) => analysis.remove(id);

  const addedConfigs = analysis.addedConfigs;

  const q = query.trim().toLowerCase();
  const library = q
    ? ANALYSES.filter((a) => `${a.name} ${a.description}`.toLowerCase().includes(q))
    : ANALYSES;

  // Shortened row for the Added section: name + remove only (no description).
  const renderAddedRow = (config: AnalysisConfig) => (
    <div key={config.id} className="analysis-row">
      <div className="analysis-item">
        <span className="analysis-item__name">{config.name}</span>
      </div>
      <button
        type="button"
        className="aoi-row__trash"
        title="Remove from Added"
        aria-label="Remove from Added"
        onClick={() => removeFromAdded(config.id)}
      >
        <DeleteOutlineIcon fontSize="inherit" />
      </button>
    </div>
  );

  // Full Library row: name + description + add.
  const renderLibraryRow = (config: AnalysisConfig) => (
    <div key={config.id} className="analysis-row">
      <div className="analysis-item">
        <span className="analysis-item__name">{config.name}</span>
        <span className="analysis-item__desc">{config.description}</span>
      </div>
      <div className="analysis-row__actions">
        <button
          type="button"
          className="aoi-row__add"
          title="Analysis settings"
          aria-label="Analysis settings"
          onClick={() => setSettingsConfig(config)}
        >
          <SettingsIcon fontSize="inherit" />
        </button>
        <button
          type="button"
          className="aoi-row__add"
          title={isAdded(config.id) ? 'Already added' : 'Add to Added'}
          aria-label="Add to Added"
          disabled={isAdded(config.id)}
          onClick={() => addToAdded(config.id)}
        >
          <AddIcon fontSize="inherit" />
        </button>
      </div>
    </div>
  );

  const hasAdded = addedConfigs.length > 0;
  // When collapsed with added analyses, the Added list replaces the search box.
  const showSearch = expanded || !hasAdded;

  return (
    <div className={`data-widget${expanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="data-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="data-widget__title">Analyses</span>
        <svg
          className="data-widget__chevron"
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

      {/* Added section, above the search field. The label is hidden while
          collapsed (the list alone stands in for the search box). */}
      {hasAdded && (
        <div className="aoi-section">
          {expanded && <div className="aoi-section__label">Added</div>}
          <div className="data-widget__list">{addedConfigs.map(renderAddedRow)}</div>
        </div>
      )}

      {showSearch && (
        <div className="data-widget__search">
          <input
            type="text"
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search analyses"
            aria-label="Search analyses"
          />
        </div>
      )}

      {expanded && (
        <div className="aoi-section">
          <div className="aoi-section__label">Library</div>
          {library.length === 0 ? (
            <div className="data-widget__empty">No analyses</div>
          ) : (
            <div className="data-widget__list">{library.map(renderLibraryRow)}</div>
          )}
        </div>
      )}

      {settingsConfig && (
        <AnalysisSettingsModal
          config={settingsConfig}
          onClose={() => setSettingsConfig(null)}
        />
      )}
    </div>
  );
});
