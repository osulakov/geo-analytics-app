import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';

import { useStores } from '../stores/StoreContext';
import { useApplyJobs } from './useApplyJobs';
import type { Job } from '../stores/JobStore';

/** Format an ISO timestamp as a short local date. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/**
 * Recent jobs widget: lists the signed-in user's saved jobs. Clicking one
 * applies it — its results combine with any other applied jobs on the map —
 * and stays on this view. Collapsed by default; expands on the chevron/typing.
 */
export const RecentJobsWidget = observer(function RecentJobsWidget() {
  const { job } = useStores();
  const applyJobs = useApplyJobs();
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    void job.loadJobs();
  }, [job]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value && !expanded) setExpanded(true);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return job.jobs;
    return job.jobs.filter((j) => j.name.toLowerCase().includes(q));
  }, [query, job.jobs]);

  const hasApplied = job.applied.length > 0;
  // When collapsed with applied jobs, the Applied list replaces the search box.
  const showSearch = expanded || !hasApplied;

  const handleOpen = async (saved: Job) => {
    setOpeningId(saved.id);
    try {
      job.apply(saved);
      await applyJobs(job.applied);
    } finally {
      setOpeningId(null);
    }
  };

  const handleUnapply = async (id: string) => {
    job.unapply(id);
    await applyJobs(job.applied);
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

      {/* Applied jobs, above the search field. Label hidden while collapsed
          (the list alone stands in for the search box). */}
      {hasApplied && (
        <div className="aoi-section">
          {expanded && <div className="aoi-section__label">Applied</div>}
          <div className="data-widget__list">
            {job.applied.map((j) => (
              <div key={j.id} className="applied-job-row">
                <button
                  type="button"
                  className="applied-job-row__name"
                  disabled={openingId !== null}
                  onClick={() => handleOpen(j)}
                >
                  {j.name}
                </button>
                <button
                  type="button"
                  className="aoi-row__trash"
                  title="Remove from applied"
                  aria-label="Remove from applied"
                  onClick={() => handleUnapply(j.id)}
                >
                  <DeleteOutlineIcon fontSize="inherit" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSearch && (
        <div className="data-widget__search">
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search jobs"
            aria-label="Search jobs"
          />
        </div>
      )}

      {expanded && (
        <div className="aoi-section">
          <div className="aoi-section__label">Recent jobs</div>
          {filtered.length === 0 ? (
            <div className="data-widget__empty">
              {job.jobs.length === 0 ? 'No recent jobs' : 'No matching jobs'}
            </div>
          ) : (
            <div className="data-widget__list">
              {filtered.map((saved) => (
                <button
                  key={saved.id}
                  type="button"
                  className="recent-job-row"
                  disabled={openingId !== null}
                  onClick={() => handleOpen(saved)}
                >
                  <span className="recent-job-row__name">{saved.name}</span>
                  <span className="recent-job-row__meta">
                    {formatDate(saved.createdAt)} · {saved.eventCount} events
                    {saved.aoiWkt ? ' · AOI' : ' · global'}
                    {openingId === saved.id ? ' · opening…' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
