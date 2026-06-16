import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import AnimationIcon from '@mui/icons-material/Animation';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import LayersIcon from '@mui/icons-material/Layers';
import ImageIcon from '@mui/icons-material/Image';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

import { useStores } from '../stores/StoreContext';
import triangleIcon from '../assets/analytics_triangle.svg?raw';
import diamondIcon from '../assets/analytics_diamond.svg?raw';
import { createMockDeviceTrack, type MockPing, type MockVessel } from '../data_loaders/mock';
import { imageUrl, uploadImage } from '../data_loaders/media';
import type { Satellite } from '../data_loaders/satellites';

const FLAGS = ['Panama', 'Liberia', 'Marshall Islands', 'Singapore', 'Malta', 'Greece'];
const TYPES = ['Cargo', 'Tanker', 'Fishing', 'Passenger', 'Container', 'Bulk Carrier'];
const NAMES = ['Star', 'Wave', 'Horizon', 'Vanguard', 'Meridian', 'Aurora', 'Falcon', 'Orca'];
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rand(a.length)];

/** Format a stored image's ISO timestamp as `YYYY-MM-DD HH:MM` (UTC). */
function formatImgTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

// Fraction of the viewport's smaller dimension the footprint should span when
// flying to an imagery item (0.5 → bbox fills half the screen, ~50% margin).
const IMAGERY_FIT_FILL = 0.5;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Globe zoom that fits a footprint on screen with margin. In the orthographic
 * projection a vertex at angular distance θ from the footprint centre lands at
 * screen radius scale·sin(θ), and scale ≈ (minDim/2)·zoom — so the viewport
 * dimensions cancel and zoom = FILL / sin(θ_max). Returns Infinity for a
 * point-sized footprint (the caller clamps it to the max zoom).
 */
function fitZoom(center: [number, number], ring: [number, number][]): number {
  const [lon0, lat0] = center;
  const rLat0 = toRad(lat0);
  let maxTheta = 0;
  for (const [lon, lat] of ring) {
    const rLat = toRad(lat);
    const cosTheta =
      Math.sin(rLat0) * Math.sin(rLat) +
      Math.cos(rLat0) * Math.cos(rLat) * Math.cos(toRad(lon - lon0));
    const theta = Math.acos(Math.min(1, Math.max(-1, cosTheta)));
    if (theta > maxTheta) maxTheta = theta;
  }
  const s = Math.sin(maxTheta);
  return s > 1e-6 ? IMAGERY_FIT_FILL / s : Number.POSITIVE_INFINITY;
}

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
// Imagery layer legend color (matches the red diamond footprint icon on the map).
const IMAGERY_COLOR = '#ef4444';

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
  const { satellite, layers, mock, vessel, ping, group, imagery, globe } = useStores();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  // Active category tab. Layers is selected by default.
  const [tab, setTab] = useState<'layers' | 'satellites' | 'ais' | 'imagery' | 'ingest'>('layers');

  // Imagery ingestion form state.
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [satName, setSatName] = useState('');
  const [imgWkt, setImgWkt] = useState('');
  const [imgTimestamp, setImgTimestamp] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  // Imagery pending deletion (shows the confirm modal).
  const [pendingImage, setPendingImage] = useState<{ id: string; name: string } | null>(null);

  // Refresh stored imagery whenever the Imagery tab is shown.
  useEffect(() => {
    if (tab === 'imagery') void imagery.load();
  }, [tab, imagery]);

  const confirmDeleteImage = async () => {
    if (pendingImage) await imagery.remove(pendingImage.id);
    setPendingImage(null);
  };

  // Swap in a fresh object-URL preview for the chosen file, revoking the old one.
  const pickFile = (file: File | null) => {
    setImgFile(file);
    setImgPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const handleUpload = async () => {
    if (!imgFile) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const meta = await uploadImage(imgFile, satName, imgWkt, imgTimestamp);
      setUploadMsg(`Saved ${meta.filename}`);
      pickFile(null);
      setSatName('');
      setImgWkt('');
      setImgTimestamp('');
      if (fileRef.current) fileRef.current.value = '';
      void imagery.load();
    } catch (error) {
      console.error('Image upload failed:', error);
      setUploadMsg('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Fly to an imagery footprint and zoom so its bbox fits the screen with a
  // ~50% margin (clamped to the max zoom for tiny footprints).
  const flyToImagery = (item: (typeof imagery.items)[number]) => {
    if (!item.center) return;
    const zoom = item.polygon ? fitZoom(item.center, item.polygon) : undefined;
    globe.flyTo(item.center[0], item.center[1], zoom);
  };

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
    // Search filters satellites, so jump to that tab when the user types.
    if (value) setTab('satellites');
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
          <div
            className="globe-controls widget-toolbar data-widget__tabs"
            role="radiogroup"
            aria-label="Data category"
          >
            <button
              type="button"
              className={tab === 'layers' ? 'active' : ''}
              role="radio"
              aria-checked={tab === 'layers'}
              title="Layers"
              aria-label="Layers"
              onClick={() => setTab('layers')}
            >
              <LayersIcon fontSize="small" sx={{ fontSize: 17 }} />
            </button>
            <button
              type="button"
              className={tab === 'satellites' ? 'active' : ''}
              role="radio"
              aria-checked={tab === 'satellites'}
              title="Satellites"
              aria-label="Satellites"
              onClick={() => setTab('satellites')}
            >
              <SatelliteAltIcon fontSize="small" sx={{ fontSize: 16 }} />
            </button>
            <button
              type="button"
              className={`globe-controls__label${tab === 'ais' ? ' active' : ''}`}
              role="radio"
              aria-checked={tab === 'ais'}
              title="AIS data"
              aria-label="AIS data"
              onClick={() => setTab('ais')}
            >
              AIS
            </button>
            <button
              type="button"
              className={tab === 'imagery' ? 'active' : ''}
              role="radio"
              aria-checked={tab === 'imagery'}
              title="Imagery"
              aria-label="Imagery"
              onClick={() => setTab('imagery')}
            >
              <ImageIcon fontSize="small" sx={{ fontSize: 16 }} />
            </button>
            <button
              type="button"
              className={tab === 'ingest' ? 'active' : ''}
              role="radio"
              aria-checked={tab === 'ingest'}
              title="Ingest imagery"
              aria-label="Ingest imagery"
              onClick={() => setTab('ingest')}
            >
              <AddPhotoAlternateIcon fontSize="small" sx={{ fontSize: 16 }} />
            </button>
          </div>

          {tab === 'layers' && (
            <div className="mock-writer">
              <div className="layer">
                <div className="layer__header">
                  <span className="layer__leaf">
                    <span
                      className="layer__icon"
                      style={{ color: DEVICE_TRACKS_COLOR }}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: triangleIcon }}
                    />
                    <span className="layer__name">AIS Pings</span>
                  </span>
                  <Toggle
                    on={layers.deviceTracksVisible}
                    onChange={() => layers.toggleDeviceTracks()}
                    label="Toggle AIS Pings layer"
                  />
                </div>
              </div>

              <div className="layer">
                <div className="layer__header">
                  <button
                    type="button"
                    className="layer__expand"
                    aria-expanded={layers.imageryExpanded}
                    onClick={() => layers.toggleImageryExpanded()}
                  >
                    <svg
                      className={`layer__chevron${layers.imageryExpanded ? ' is-open' : ''}`}
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
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                    <span
                      className="layer__icon"
                      style={{ color: IMAGERY_COLOR }}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: diamondIcon }}
                    />
                    <span className="layer__name">Imagery</span>
                  </button>
                  <Toggle
                    on={layers.imageryVisible}
                    onChange={() => layers.toggleImagery()}
                    label="Toggle Imagery layer"
                  />
                </div>
                {layers.imageryExpanded && (
                  <div className="layer__sublayers">
                    <div className="sublayer">
                      <span className="sublayer__name">Icon</span>
                      <Toggle
                        on={layers.imageryIconVisible}
                        onChange={() => layers.toggleImageryIcon()}
                        label="Toggle imagery icon sublayer"
                      />
                    </div>
                    <div className="sublayer">
                      <span className="sublayer__name">Image</span>
                      <Toggle
                        on={layers.imageryImageVisible}
                        onChange={() => layers.toggleImageryImage()}
                        label="Toggle imagery image sublayer"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'satellites' && (
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
            </>
          )}

          {tab === 'ais' && (
            <>
              <div className="mock-writer">
                <div className="layer">
                  <div className="layer__header">
                    <span className="layer__leaf">
                      <span
                        className="layer__icon"
                        style={{ color: DEVICE_TRACKS_COLOR }}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: triangleIcon }}
                      />
                      <span className="layer__name">AIS Pings</span>
                    </span>
                    <Toggle
                      on={layers.deviceTracksVisible}
                      onChange={() => layers.toggleDeviceTracks()}
                      label="Toggle AIS Pings layer"
                    />
                  </div>
                </div>
              </div>

              <div className="data-widget__group-label">Generate mock AIS data</div>
              <div className="mock-writer">
              {mock.drawing ? (
                <>
                  <div className="mock-writer__drawing">
                    Drawing device track — click to add points, double-click to finish.
                  </div>
                  <button type="button" className="mock-writer__start" onClick={() => mock.cancel()}>
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
                  Start drawing vessel track
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
            </>
          )}

          {tab === 'imagery' && (
            <div className="mock-writer">
              <div className="layer">
                <div className="layer__header">
                  <button
                    type="button"
                    className="layer__expand"
                    aria-expanded={layers.imageryExpanded}
                    onClick={() => layers.toggleImageryExpanded()}
                  >
                    <svg
                      className={`layer__chevron${layers.imageryExpanded ? ' is-open' : ''}`}
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
                      <polyline points="9 6 15 12 9 18" />
                    </svg>
                    <span
                      className="layer__icon"
                      style={{ color: IMAGERY_COLOR }}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: diamondIcon }}
                    />
                    <span className="layer__name">Imagery</span>
                  </button>
                  <Toggle
                    on={layers.imageryVisible}
                    onChange={() => layers.toggleImagery()}
                    label="Toggle Imagery layer"
                  />
                </div>
                {layers.imageryExpanded && (
                  <div className="layer__sublayers">
                    <div className="sublayer">
                      <span className="sublayer__name">Icon</span>
                      <Toggle
                        on={layers.imageryIconVisible}
                        onChange={() => layers.toggleImageryIcon()}
                        label="Toggle imagery icon sublayer"
                      />
                    </div>
                    <div className="sublayer">
                      <span className="sublayer__name">Image</span>
                      <Toggle
                        on={layers.imageryImageVisible}
                        onChange={() => layers.toggleImageryImage()}
                        label="Toggle imagery image sublayer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="imagery-list">
                {imagery.items.length === 0 ? (
                  <div className="mock-writer__hint">No imagery yet.</div>
                ) : (
                  imagery.items.map((item) => (
                    <div key={item.meta.id} className="imagery-item-wrap">
                      <button
                        type="button"
                        className="imagery-item"
                        onClick={() => flyToImagery(item)}
                        disabled={!item.center}
                        title={item.center ? 'Fly to footprint' : 'No footprint'}
                      >
                        <img
                          className="imagery-item__thumb"
                          src={imageUrl(item.meta.id)}
                          alt={item.meta.filename}
                          loading="lazy"
                        />
                        <div className="imagery-item__meta">
                          <span className="imagery-item__name">
                            {item.meta.satelliteName ?? item.meta.filename}
                          </span>
                          <span className="imagery-item__time">
                            {formatImgTime(item.meta.timestamp ?? item.meta.createdAt)}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="aoi-row__trash"
                        title="Delete imagery"
                        aria-label="Delete imagery"
                        onClick={() =>
                          setPendingImage({
                            id: item.meta.id,
                            name: item.meta.satelliteName ?? item.meta.filename,
                          })
                        }
                      >
                        <DeleteOutlineIcon fontSize="inherit" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'ingest' && (
            <>
              <div className="data-widget__group-label">Ingest imagery</div>
              <div className="mock-writer">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="imagery__file"
                  aria-label="Image file"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
                {imgPreview && (
                  <img className="imagery__preview" src={imgPreview} alt="Selected image preview" />
                )}
                <input
                  type="text"
                  className="mock-writer__select"
                  placeholder="Satellite name"
                  value={satName}
                  onChange={(event) => setSatName(event.target.value)}
                  aria-label="Satellite name"
                />
                <input
                  type="text"
                  className="mock-writer__select"
                  placeholder="WKT (POLYGON((…)))"
                  value={imgWkt}
                  onChange={(event) => setImgWkt(event.target.value)}
                  aria-label="Image WKT"
                />
                <input
                  type="datetime-local"
                  className="mock-writer__select"
                  value={imgTimestamp}
                  onChange={(event) => setImgTimestamp(event.target.value)}
                  aria-label="Capture timestamp"
                />
                <button
                  type="button"
                  className="mock-writer__create"
                  disabled={!imgFile || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? 'Uploading…' : 'Upload to media bucket'}
                </button>
                {uploadMsg && <div className="mock-writer__hint">{uploadMsg}</div>}
              </div>
            </>
          )}
        </>
      )}

      {pendingImage &&
        createPortal(
          <div className="confirm-dialog__overlay" onClick={() => setPendingImage(null)}>
            <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="confirm-dialog__text">
                Delete imagery “{pendingImage.name}” from the media bucket? This cannot be undone.
              </div>
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__cancel"
                  onClick={() => setPendingImage(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="confirm-dialog__delete"
                  onClick={confirmDeleteImage}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});
