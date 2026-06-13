import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';

import { ANALYSES, type AnalysisConfig } from '../analyses_configs';
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

  const renderRow = (analysis: AnalysisConfig, inAdded: boolean) => (
    <div key={analysis.id} className="analysis-row">
      <div className="analysis-item">
        <span className="analysis-item__name">{analysis.name}</span>
        <span className="analysis-item__desc">{analysis.description}</span>
      </div>
      {inAdded ? (
        <button
          type="button"
          className="aoi-row__trash"
          title="Remove from Added"
          aria-label="Remove from Added"
          onClick={() => removeFromAdded(analysis.id)}
        >
          <DeleteOutlineIcon fontSize="inherit" />
        </button>
      ) : (
        <button
          type="button"
          className="aoi-row__add"
          title={isAdded(analysis.id) ? 'Already added' : 'Add to Added'}
          aria-label="Add to Added"
          disabled={isAdded(analysis.id)}
          onClick={() => addToAdded(analysis.id)}
        >
          <AddIcon fontSize="inherit" />
        </button>
      )}
    </div>
  );

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

      <div className="data-widget__search">
        <input
          type="text"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search analyses"
          aria-label="Search analyses"
        />
      </div>

      {expanded && (
        <>
          {addedConfigs.length > 0 && (
            <div className="aoi-section">
              <div className="aoi-section__label">Added</div>
              <div className="data-widget__list">
                {addedConfigs.map((analysis) => renderRow(analysis, true))}
              </div>
            </div>
          )}

          <div className="aoi-section">
            <div className="aoi-section__label">Library</div>
            {library.length === 0 ? (
              <div className="data-widget__empty">No analyses</div>
            ) : (
              <div className="data-widget__list">
                {library.map((analysis) => renderRow(analysis, false))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
