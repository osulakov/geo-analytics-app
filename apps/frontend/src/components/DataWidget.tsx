import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import AnimationIcon from '@mui/icons-material/Animation';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { useStores } from '../stores/StoreContext';
import triangleIcon from '../assets/analytics_triangle.svg?raw';
import { createMockDeviceTrack, type MockPing, type MockVessel } from '../data_loaders/mock';
import type { Satellite } from '../data_loaders/satellites';

const FLAGS = ['Panama', 'Liberia', 'Marshall Islands', 'Singapore', 'Malta', 'Greece'];
const TYPES = ['Cargo', 'Tanker', 'Fishing', 'Passenger', 'Container', 'Bulk Carrier'];
const NAMES = ['Star', 'Wave', 'Horizon', 'Vanguard', 'Meridian', 'Aurora', 'Falcon', 'Orca'];
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];

/** Random vessel for a mocked device track. */
function buildMockVessel(): MockVessel {
  return {
    mmsi: `${2 + rand(6)}${Array.from({ length: 8 }, () => rand(10)).join('')}`,
    imo: Array.from({ length: 7 }, () => rand(10)).join(''),
    vesselName: `Mock ${pick(NAMES)} ${100 + rand(900)}`,
    callsign: Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[rand(34)]).join(''),
    flagState: pick(FLAGS),
    vesselType: pick(TYPES),
    length: 50 + rand(250),
    width: 10 + rand(40),
    draft: 3 + rand(15),
  };
}

/** Position + heading at fraction t (0..1) along a [lon,lat] polyline. */
function pointAt(points: [number, number][], t: number) {
  const segs: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
    segs.push(len);
    total += len;
  }
  if (total === 0) return { lon: points[0][0], lat: points[0][1], heading: 0 };
  let target = t * total;
  for (let i = 0; i < segs.length; i += 1) {
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] === 0 ? 0 : target / segs[i];
      const dLon = points[i + 1][0] - points[i][0];
      const dLat = points[i + 1][1] - points[i][1];
      const heading = (((Math.atan2(dLon, dLat) * 180) / Math.PI) + 360) % 360;
      return { lon: points[i][0] + dLon * f, lat: points[i][1] + dLat * f, heading };
    }
    target -= segs[i];
  }
  const last = points[points.length - 1];
  return { lon: last[0], lat: last[1], heading: 0 };
}

/** Hourly device-track pings along the line, spread across the date range. */
function buildMockPings(points: [number, number][], fromIso: string, toIso: string): MockPing[] {
  const start = Date.parse(fromIso);
  const end = Date.parse(toIso);
  const hourMs = 3_600_000;
  const n = Math.max(2, Math.min(2000, Math.floor((end - start) / hourMs) + 1));
  const round = (v: number) => Math.round(v * 100) / 100;
  return Array.from({ length: n }, (_, i) => {
    const { lon, lat, heading } = pointAt(points, n === 1 ? 0 : i / (n - 1));
    return {
      ts: new Date(start + i * hourMs).toISOString(),
      lon,
      lat,
      heading: round(heading),
      speed: round(8 + Math.random() * 8),
    };
  });
}

// Device tracks legend color (matches the yellow triangle markers on the map).
const DEVICE_TRACKS_COLOR = '#facc15';

const PAGE_SIZE = 5;

/** Small box-style checkbox (same look as the Layers widget). */
function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
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
  );
}

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
  // Selecting a satellite both expands its detail and makes its ping pulse.
  const expanded = satellite.isSelected(sat.name);
  const orbitOn = satellite.isOrbitOn(sat.name);
  const chasing = satellite.isChasing(sat.name);

  return (
    <div className={`satellite-row${expanded ? ' is-selected' : ''}`}>
      <div className="satellite-row__head">
        <button
          type="button"
          className="satellite-row__name"
          onClick={() => satellite.select(sat.name)}
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
 * Right-side "Data" widget. Collapsed by default (title + search); expands on
 * typing or via the chevron. Currently contains a Satellites section; more data
 * sections can be added below it. Mirrors the layout of the Vessels widget.
 */
export const DataWidget = observer(function DataWidget() {
  const { satellite, layers, mock, vessel, ping, group } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  // Mock Data Writer: collapsed by default; what to mock (more options coming).
  const [mockOpen, setMockOpen] = useState(false);
  const [mockTarget, setMockTarget] = useState('device-tracks');

  // Mock a vessel + hourly device-track pings along the drawn line, then refetch.
  const handleCreateTrack = async () => {
    if (!mock.hasTrack) return;
    mock.setCreating(true);
    try {
      const vesselData = buildMockVessel();
      await createMockDeviceTrack(
        vesselData,
        buildMockPings(mock.points, ping.rangeStartIso, ping.rangeEndIso),
      );
      await vessel.reload();
      layers.showDeviceTracks();
      ping.reloadPings();
      mock.complete(vesselData);
    } catch (error) {
      console.error('Failed to create mock device track:', error);
    } finally {
      mock.setCreating(false);
    }
  };

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
    <div className={`data-widget${expanded ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="data-widget__header"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="data-widget__title">Data</span>
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
          placeholder="Search data"
          aria-label="Search data"
        />
      </div>

      {expanded && (
        <>
          <div className="data-widget__section-header">
            <span className="data-widget__section-title">Satellites</span>
            <button
              type="button"
              className={`satellite-row__icon${satellite.anyOrbitOn ? ' is-active' : ''}`}
              title={satellite.anyOrbitOn ? 'Hide all orbits' : 'Show all orbits'}
              aria-label={satellite.anyOrbitOn ? 'Hide all orbits' : 'Show all orbits'}
              aria-pressed={satellite.anyOrbitOn}
              onClick={() => satellite.toggleAllOrbits()}
            >
              <AnimationIcon fontSize="inherit" />
            </button>
            <button
              type="button"
              className={`satellite-row__icon${satellite.visible ? ' is-active' : ''}`}
              title={satellite.visible ? 'Hide all satellites' : 'Show all satellites'}
              aria-label={satellite.visible ? 'Hide all satellites' : 'Show all satellites'}
              aria-pressed={satellite.visible}
              onClick={() => satellite.toggleVisible()}
            >
              {satellite.visible ? (
                <VisibilityIcon fontSize="inherit" />
              ) : (
                <VisibilityOffIcon fontSize="inherit" />
              )}
            </button>
          </div>

          <div className="data-widget__list">
            {pageItems.length === 0 ? (
              <div className="data-widget__empty">No satellites found</div>
            ) : (
              pageItems.map((sat) => <SatelliteRow key={sat.name} sat={sat} />)
            )}
          </div>

          <div className="data-widget__pager">
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
              <span className="data-widget__count"> · {filtered.length}</span>
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

          <div className="data-widget__group-label">AIS data</div>

          <div className="data-widget__section-header">
            <span
              className="layer__icon"
              style={{ color: DEVICE_TRACKS_COLOR }}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: triangleIcon }}
            />
            <span className="data-widget__section-title">Device tracks</span>
            <Toggle
              on={layers.deviceTracksVisible}
              onChange={() => layers.toggleDeviceTracks()}
              label="Toggle Device tracks layer"
            />
          </div>

          <div className="mock-writer-section">
            <button
              type="button"
              className="mock-writer__header"
              aria-expanded={mockOpen}
              onClick={() => setMockOpen((o) => !o)}
            >
              <span>Mock Data Writer</span>
              <svg
                className={`mock-writer__chevron${mockOpen ? ' is-open' : ''}`}
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
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {mockOpen && (
              <div className="mock-writer">
                <select
                  className="mock-writer__select"
                  value={mockTarget}
                  onChange={(event) => setMockTarget(event.target.value)}
                  disabled={mock.drawing || mock.creating}
                  aria-label="What to mock"
                >
                  <option value="device-tracks">Device tracks</option>
                </select>

                {mock.drawing ? (
                  <>
                    <div className="mock-writer__drawing">
                      Drawing device track — click to add points, double-click to finish.
                    </div>
                    <button
                      type="button"
                      className="mock-writer__start"
                      onClick={() => mock.cancel()}
                    >
                      Cancel
                    </button>
                  </>
                ) : mock.hasTrack ? (
                  <button
                    type="button"
                    className="mock-writer__create"
                    disabled={mock.creating}
                    onClick={handleCreateTrack}
                  >
                    {mock.creating ? 'Creating…' : 'Create device track'}
                  </button>
                ) : (
                  <button type="button" className="mock-writer__start" onClick={() => mock.start()}>
                    Start drawing
                  </button>
                )}

                {mock.created && !mock.drawing && (
                  <div className="mock-writer__created">
                    <div className="mock-writer__created-name">{mock.created.vesselName}</div>
                    <div className="mock-writer__created-meta">
                      {mock.created.mmsi} · {mock.created.flagState} · {mock.created.vesselType}
                    </div>
                    <select
                      className="mock-writer__select"
                      value=""
                      aria-label="Add vessel to group"
                      onChange={(event) => {
                        const g = group.groups.find((x) => String(x.id) === event.target.value);
                        if (g && mock.created) void group.addMember(g.id, mock.created.mmsi);
                      }}
                    >
                      <option value="">Add to group…</option>
                      {group.groups.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
});
