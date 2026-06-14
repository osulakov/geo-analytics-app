import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { ANALYSES } from '../analyses_configs';
import type { Job } from '../stores/JobStore';

/** Format an ISO timestamp as a short local date. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/**
 * Recent jobs widget: lists the signed-in user's saved jobs. Clicking one
 * re-runs its analysis (events aren't persisted) and shows the results on the
 * map. Collapsed by default; expands on the chevron or on typing.
 */
export const RecentJobsWidget = observer(function RecentJobsWidget() {
  const { job, analysis, event, ping, layers } = useStores();
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

  const handleOpen = async (saved: Job) => {
    setOpeningId(saved.id);
    try {
      const events = await analysis.runConfig(
        saved.analysisConfigId,
        saved.aoiWkt,
        saved.fromIso,
        saved.toIso,
      );
      event.setJobEvents(events);

      // AOI-bounded device tracks, if the job's analysis declares them.
      const config = ANALYSES.find((a) => a.id === saved.analysisConfigId);
      if (config?.layers_config.some((layer) => layer.config?.aoi_bounded)) {
        await ping.loadAoiDeviceTracks(saved.aoiWkt);
      } else {
        ping.clearAoiDeviceTracks();
      }
      layers.showAll();
    } finally {
      setOpeningId(null);
    }
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
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search jobs"
          aria-label="Search jobs"
        />
      </div>

      {expanded && (
        <div className="data-widget__list">
          {filtered.length === 0 ? (
            <div className="data-widget__empty">
              {job.jobs.length === 0 ? 'No recent jobs' : 'No matching jobs'}
            </div>
          ) : (
            filtered.map((saved) => (
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
            ))
          )}
        </div>
      )}
    </div>
  );
});
