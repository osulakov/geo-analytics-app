import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import AnimationIcon from '@mui/icons-material/Animation';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';

import { useStores } from '../stores/StoreContext';
import type { Satellite } from '../data_loaders/satellites';

const PAGE_SIZE = 5;

/** A labelled orbital field; renders "—" when the value is missing. */
function DetailRow({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="satellite-detail__row">
      <span className="satellite-detail__label">{label}</span>
      <span className="satellite-detail__value">
        {value == null ? '—' : `${value} ${unit}`}
      </span>
    </div>
  );
}

/**
 * One satellite row: name + orbit/chasing toggles, expandable to show the full
 * orbit parameters. The toggles flip store state only — map wiring comes later.
 */
const SatelliteRow = observer(function SatelliteRow({ sat }: { sat: Satellite }) {
  const { satellite } = useStores();
  const [expanded, setExpanded] = useState(false);
  const orbitOn = satellite.isOrbitOn(sat.name);
  const chasing = satellite.isChasing(sat.name);

  return (
    <div className="satellite-row">
      <div className="satellite-row__head">
        <button
          type="button"
          className="satellite-row__name"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <svg
            className={`satellite-row__chevron${expanded ? ' is-open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{sat.name}</span>
        </button>
        <button
          type="button"
          className={`satellite-row__icon${orbitOn ? ' is-active' : ''}`}
          title={orbitOn ? 'Hide orbit' : 'Show orbit'}
          aria-label={orbitOn ? 'Hide orbit' : 'Show orbit'}
          aria-pressed={orbitOn}
          onClick={() => satellite.toggleOrbit(sat.name)}
        >
          <AnimationIcon fontSize="inherit" />
        </button>
        <button
          type="button"
          className={`satellite-row__icon${chasing ? ' is-active' : ''}`}
          title={chasing ? 'Stop chasing coverage' : 'Chase coverage'}
          aria-label={chasing ? 'Stop chasing coverage' : 'Chase coverage'}
          aria-pressed={chasing}
          onClick={() => satellite.toggleChasing(sat.name)}
        >
          <SatelliteAltIcon fontSize="inherit" />
        </button>
      </div>

      {expanded && (
        <div className="satellite-detail">
          <div className="satellite-detail__row">
            <span className="satellite-detail__label">Constellation</span>
            <span className="satellite-detail__value">{sat.constellation}</span>
          </div>
          <DetailRow label="Altitude" value={sat.altitudeKm} unit="km" />
          <DetailRow label="Inclination" value={sat.inclinationDeg} unit="°" />
          <DetailRow label="Orbital period" value={sat.orbitalPeriodMin} unit="min" />
          <DetailRow label="Swath width" value={sat.swathWidthKm} unit="km" />
          <DetailRow label="Ground velocity" value={sat.groundVelocityKmSec} unit="km/s" />
          <DetailRow label="Look angle" value={sat.lookAngleDeg} unit="°" />
          <DetailRow label="RAAN" value={sat.raanDeg} unit="°" />
          <DetailRow label="Mean anomaly" value={sat.meanAnomalyDeg} unit="°" />
        </div>
      )}
    </div>
  );
});

/**
 * Right-side widget listing satellites from the DB. Collapsed by default
 * (title + search); expands on typing or via the chevron. Mirrors the layout
 * of the Vessels widget.
 */
export const SatellitesWidget = observer(function SatellitesWidget() {
  const { satellite } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return satellite.satellites;
    return satellite.satellites.filter((s) =>
      `${s.name} ${s.constellation}`.toLowerCase().includes(q),
    );
  }, [query, satellite.satellites]);

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
    <div className={`satellites-widget${expanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="satellites-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>Satellites</span>
        <svg
          className="satellites-widget__chevron"
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

      <div className="satellites-widget__search">
        <input
          type="text"
          value={query}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search satellites"
          aria-label="Search satellites"
        />
      </div>

      {expanded && (
        <>
          <div className="satellites-widget__list">
            {pageItems.length === 0 ? (
              <div className="satellites-widget__empty">No satellites found</div>
            ) : (
              pageItems.map((sat) => <SatelliteRow key={sat.name} sat={sat} />)
            )}
          </div>

          <div className="satellites-widget__pager">
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
              <span className="satellites-widget__count"> · {filtered.length}</span>
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
        </>
      )}
    </div>
  );
});
