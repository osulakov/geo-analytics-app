import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';
import { colorForMmsi } from '../utils/colorMap';
import type { StaticVesselInfo } from '../api/vessels';

const PAGE_SIZE = 5;

function searchableText(vessel: StaticVesselInfo): string {
  return [
    vessel.mmsi,
    vessel.imo,
    vessel.vesselName,
    vessel.callsign,
    vessel.flagState,
    vessel.vesselType,
    vessel.length,
    vessel.width,
    vessel.draft,
  ]
    .map((value) => (value == null ? '' : String(value)))
    .join(' ')
    .toLowerCase();
}

/**
 * Searchable, paginated list of all vessels. Collapsed by default (title +
 * search); expands on typing or via the chevron. Only one page (5 rows) is
 * ever rendered, regardless of how many vessels exist.
 */
export const VesselsWidget = observer(function VesselsWidget() {
  const { vessel, ping, globe } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const handleVesselClick = (mmsi: string) => {
    ping.setHighlight(mmsi);
    const latest = ping.pings.find((p) => p.mmsi === mmsi);
    if (latest) globe.flyTo(latest.lon, latest.lat);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vessel.vessels;
    return vessel.vessels.filter((v) => searchableText(v).includes(q));
  }, [query, vessel.vessels]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(0);
    if (value && !expanded) setExpanded(true);
  };

  return (
    <div className={`vessels-widget${expanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="vessels-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>Vessels</span>
        <svg
          className="vessels-widget__chevron"
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

      <div className="vessels-widget__search">
        <input
          type="text"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search vessels"
          aria-label="Search vessels"
        />
      </div>

      {expanded && (
        <div className="vessels-widget__list">
          {pageItems.length === 0 ? (
            <div className="vessels-widget__empty">No vessels found</div>
          ) : (
            pageItems.map((v) => (
              <button
                key={v.mmsi}
                type="button"
                className="vessel-row"
                onClick={() => handleVesselClick(v.mmsi)}
              >
                <span
                  className="vessel-row__color"
                  style={{ background: colorForMmsi(v.mmsi) }}
                />
                <div className="vessel-row__info">
                  <div className="vessel-row__name">{v.vesselName}</div>
                  <div className="vessel-row__meta">
                    {v.mmsi} · {v.flagState ?? '—'} · {v.vesselType ?? '—'}
                  </div>
                </div>
              </button>
            ))
          )}

          <div className="vessels-widget__pager">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ‹
            </button>
            <span>
              {currentPage + 1} / {pageCount}
              <span className="vessels-widget__count"> · {filtered.length}</span>
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
