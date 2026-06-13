import { useState } from 'react';

/**
 * Recent jobs widget. Collapsed by default (title + search); expands on the
 * chevron or when the user starts typing. Placeholder list for now.
 */
export function RecentJobsWidget() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value && !expanded) setExpanded(true);
  };

  return (
    <div className={`data-widget${expanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="data-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="data-widget__title">Recent jobs results</span>
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
          placeholder="Search jobs"
          aria-label="Search jobs"
        />
      </div>

      {expanded && (
        <div className="data-widget__list">
          <div className="data-widget__empty">No recent jobs</div>
        </div>
      )}
    </div>
  );
}
