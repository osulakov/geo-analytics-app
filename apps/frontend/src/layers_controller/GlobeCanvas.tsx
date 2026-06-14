import { useEffect, useRef } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

import countries110m from 'world-atlas/countries-110m.json';
// Simplified EEZ geometry (~1.3 MB, down from the 33 MB source via mapshaper)
// so it can be re-projected every frame without tanking the frame rate.
// Resolved to a static URL and fetched lazily the first time the layer is on.
import eezUrl from '../assets/eez-simplified.geojson?url';
import analyticsSquareRaw from '../assets/analytics_square.svg?raw';
import { useStores } from '../stores/StoreContext';
import { colorForMmsi, colorForMmsiAlpha } from './colorMap';
import type { MapEvent } from '../data_loaders/events';
import type { Satellite } from '../data_loaders/satellites';

// Red geofence-event icon (the square SVG, recolored). The SVG is rasterized
// once into an offscreen bitmap canvas — drawing an <img> SVG per marker is
// very slow (it re-rasterizes each call), which freezes the globe when a job
// produces thousands of events. Blitting the cached bitmap is fast.
const GEOFENCE_COLOR = '#ef4444';
const GEOFENCE_ICON_SIZE = 16;
// Rasterize at 2× for crisp downscaling on hi-dpi screens.
const GEOFENCE_BITMAP_SIZE = GEOFENCE_ICON_SIZE * 2;
const geofenceIconCanvas = document.createElement('canvas');
geofenceIconCanvas.width = GEOFENCE_BITMAP_SIZE;
geofenceIconCanvas.height = GEOFENCE_BITMAP_SIZE;
let geofenceIconReady = false;
{
  const img = new Image();
  img.onload = () => {
    const c = geofenceIconCanvas.getContext('2d');
    if (!c) return;
    c.drawImage(img, 0, 0, GEOFENCE_BITMAP_SIZE, GEOFENCE_BITMAP_SIZE);
    geofenceIconReady = true;
  };
  img.src =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(analyticsSquareRaw.replace(/currentColor/g, GEOFENCE_COLOR));
}

// AIS-off (gap) events: orange upward triangle drawn directly on the canvas.
const AIS_OFF_COLOR = '#ef6a20';
const AIS_OFF_SIZE = 14;

// Areas of interest. Committed polygons are blue; the in-progress draft is
// yellow so it reads as "still drawing".
const AOI_STROKE = '#3b82f6';
const AOI_FILL = 'rgba(59, 130, 246, 0.2)';
const AOI_DRAFT_STROKE = '#facc15';
const AOI_DRAFT_HINT = 'rgba(250, 204, 21, 0.5)';
// AOIs in the "Added" working set are highlighted yellow; library-only blue.
const AOI_ADDED_STROKE = '#facc15';
const AOI_ADDED_FILL = 'rgba(250, 204, 21, 0.22)';
// Click within this many pixels of the first vertex to close the polygon.
const AOI_CLOSE_RADIUS_PX = 12;

// Pre-compute the geometry once at module load — it never changes.
const topology = countries110m as unknown as Topology;
const countriesObject = topology.objects.countries as GeometryCollection;
const land = feature(topology, countriesObject) as unknown as FeatureCollection;
const boundaries = mesh(topology, countriesObject);
const graticule = geoGraticule10();

// Color per maritime-boundary LINE_TYPE. Anything unlisted uses the default.
const EEZ_LINE_COLORS: Record<string, string> = {
  'Connection line': '#8a93a3',
  Treaty: '#1dc09c',
  'Median line': '#5aa9ff',
  '200 NM': '#3b82f6',
  'Court ruling': '#a78bfa',
  'Joint regime': '#22d3ee',
  'Unilateral claim (undisputed)': '#facc15',
  'Unsettled median line (land)': '#fb923c',
  'Unsettled median line (maritime)': '#f97316',
  'Unsettled (maritime)': '#ef4444',
  'Unsettled (land)': '#f87171',
  '12 NM': '#e879f9',
};
const EEZ_DEFAULT_COLOR = 'rgba(120, 200, 255, 0.7)';

// EEZ boundaries, fetched lazily the first time the layer is toggled on, then
// grouped by color (one FeatureCollection per color) and cached for the page.
interface EezGroup {
  color: string;
  collection: FeatureCollection;
}
interface EezPoint {
  lon: number;
  lat: number;
  name: string;
}
let eezGroups: EezGroup[] | null = null;
let eezPoints: EezPoint[] | null = null;
let eezLoading = false;

function eezLabel(props: Feature['properties']): string {
  const p = (props ?? {}) as Record<string, unknown>;
  return (
    (p.LINE_NAME as string) ||
    (p.EEZ1 as string) ||
    (p.TERRITORY1 as string) ||
    'EEZ boundary'
  );
}

// Walk arbitrarily-nested GeoJSON coordinates, pushing each [lon, lat] vertex.
function collectPositions(coords: unknown, name: string, out: EezPoint[]): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') {
    out.push({ lon: coords[0] as number, lat: coords[1] as number, name });
    return;
  }
  for (const child of coords) collectPositions(child, name, out);
}

function loadEez(): void {
  if (eezGroups || eezLoading) return;
  eezLoading = true;
  fetch(eezUrl)
    .then((res) => res.json())
    .then((data: FeatureCollection) => {
      const byColor = new Map<string, Feature[]>();
      const points: EezPoint[] = [];
      for (const feat of data.features) {
        const type = (feat.properties?.LINE_TYPE as string | undefined) ?? '';
        const color = EEZ_LINE_COLORS[type] ?? EEZ_DEFAULT_COLOR;
        const group = byColor.get(color);
        if (group) group.push(feat);
        else byColor.set(color, [feat]);

        if (feat.geometry && 'coordinates' in feat.geometry) {
          collectPositions(feat.geometry.coordinates, eezLabel(feat.properties), points);
        }
      }
      eezGroups = [...byColor.entries()].map(([color, features]) => ({
        color,
        collection: { type: 'FeatureCollection', features },
      }));
      eezPoints = points;
    })
    .catch(() => {
      // Allow a later toggle to retry the fetch.
      eezLoading = false;
    });
}

// Grey palette for the basemap.
const COLORS = {
  ocean: '#2a2f37',
  land: '#3b4250',
  boundary: '#828b99',
  graticule: 'rgba(170, 185, 205, 0.45)',
  eez: 'rgba(120, 200, 255, 0.55)',
  outline: 'rgba(148, 163, 184, 0.35)',
  marker: '#ef4444',
  markerOutline: 'rgba(0, 0, 0, 0.45)',
  atmosphere: '120, 170, 255',
  pingHoverRing: '#ffffff',
  track: 'rgba(255, 255, 255, 0.85)',
} as const;

// Drag degrees-per-pixel at zoom = 1 (scaled down as you zoom in).
const DRAG_SENSITIVITY = 0.3;

// Marker radius in CSS pixels — fixed on screen regardless of globe zoom.
const MARKER_RADIUS = 2;

// Ping marker radius and the pixel distance within which a ping is "hovered".
const PING_RADIUS = 1;
// Latest ("recent") vessel pings are drawn larger than historical track points.
const RECENT_PING_RADIUS = 2;
const HOVER_RADIUS = 8;
// Pixel tolerance for hovering an EEZ line.
const EEZ_HOVER_RADIUS = 8;

// Satellites are drawn as small green pings floating above the surface.
const SATELLITE_COLOR = '#22e36a';
const SATELLITE_ORBIT_COLOR = 'rgba(34, 227, 106, 0.5)';
const SATELLITE_RADIUS = 2;
// Vertices used to trace a full orbit circle.
const ORBIT_SAMPLES = 256;
// Capture-coverage strip on the ground, ~13 km × 360 km. Width falls back to
// this when a satellite has no swath recorded.
const COVERAGE_LENGTH_KM = 360;
const COVERAGE_DEFAULT_WIDTH_KM = 13;
const COVERAGE_FILL = 'rgba(34, 227, 106, 0.22)';
const COVERAGE_STROKE = 'rgba(34, 227, 106, 0.5)';
// Pixel tolerance for hovering a satellite ping.
const SATELLITE_HOVER_RADIUS = 8;

/** Even-odd point-in-polygon test in screen space. */
function pointInPolygon(px: number, py: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
const EARTH_RADIUS_KM = 6371;
// Pixel tolerance for hovering an event marker.
const EVENT_HOVER_RADIUS = 11;

/** A ping currently under the cursor, with its on-screen position. */
export interface PingHover {
  mmsi: string;
  x: number;
  y: number;
  ts: string;
  heading: number | null;
}

/** An EEZ boundary under the cursor. */
export interface EezHover {
  name: string;
  x: number;
  y: number;
}

/** An area of interest under the cursor. */
export interface AoiHover {
  name: string;
  areaKm2: number;
  x: number;
  y: number;
}

/** A map event under the cursor. */
export interface EventHover {
  event: MapEvent;
  x: number;
  y: number;
}

/** A satellite (ping or its coverage strip) under the cursor. */
export interface SatelliteHover {
  satellite: Satellite;
  /** Footprint area in km² when hovering the coverage strip; null for the ping. */
  area: number | null;
  x: number;
  y: number;
}

interface GlobeCanvasProps {
  /** Called when the hovered ping changes (null when nothing is hovered). */
  onHover?: (hover: PingHover | null) => void;
  /** Called when the hovered EEZ boundary changes. */
  onEezHover?: (hover: EezHover | null) => void;
  /** Called when the hovered AOI changes. */
  onAoiHover?: (hover: AoiHover | null) => void;
  /** Called when the hovered event marker changes. */
  onEventHover?: (hover: EventHover | null) => void;
  /** Called when the hovered satellite (ping or coverage strip) changes. */
  onSatelliteHover?: (hover: SatelliteHover | null) => void;
  /** Called when a ping is clicked (vessel MMSI). */
  onSelect?: (mmsi: string) => void;
  /** Called (throttled, after the view settles) with the visible cap. */
  onViewportChange?: (cap: {
    lon: number;
    lat: number;
    radius: number;
    maxBucket: number;
  }) => void;
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Zoom → vessel sampling bucket (0–100, nested). At low zoom we only load a
 * fraction of vessels (every ~10th); zooming in reveals more, then all.
 */
function sampleBucket(zoom: number): number {
  if (zoom < 2) return 10; // ~every 10th
  if (zoom < 6) return 20; // ~every 5th
  if (zoom < 15) return 50; // ~every 2nd
  return 100; // all
}

/**
 * Sub-satellite longitude/latitude (degrees) for a circular orbit, from its
 * orbital elements at argument-of-latitude `uDeg` (measured from the ascending
 * node). RAAN is treated as an Earth-fixed longitude of the node — good enough
 * to spread the constellation realistically around the globe.
 */
function subSatellitePoint(
  raanDeg: number,
  inclinationDeg: number,
  uDeg: number,
): [number, number] {
  const O = (raanDeg * Math.PI) / 180;
  const i = (inclinationDeg * Math.PI) / 180;
  const u = (uDeg * Math.PI) / 180;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const x = Math.cos(O) * cu - Math.sin(O) * su * Math.cos(i);
  const y = Math.sin(O) * cu + Math.cos(O) * su * Math.cos(i);
  const z = su * Math.sin(i);
  const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI;
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  return [lon, lat];
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Initial bearing (degrees) from point 1 to point 2 on the sphere. */
function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const f1 = lat1 * D2R;
  const f2 = lat2 * D2R;
  const dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return Math.atan2(y, x) * R2D;
}

/** Point [lon, lat] reached from (lat, lon) going `distKm` along `bearingDeg`. */
function destinationPoint(
  latDeg: number,
  lonDeg: number,
  bearingDeg: number,
  distKm: number,
): [number, number] {
  const d = distKm / EARTH_RADIUS_KM;
  const t = bearingDeg * D2R;
  const f1 = latDeg * D2R;
  const l1 = lonDeg * D2R;
  const sinF2 = Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t);
  const f2 = Math.asin(Math.max(-1, Math.min(1, sinF2)));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * sinF2);
  return [(((l2 * R2D + 540) % 360) - 180), f2 * R2D];
}

// Point data to overlay on the globe. Any GeoJSON point features work here;
// coordinates are [longitude, latitude].
const markers: Feature<Point>[] = [
  {
    type: 'Feature',
    properties: { name: 'Odessa, Ukraine' },
    geometry: { type: 'Point', coordinates: [30.7233, 46.4825] },
  },
];

export function GlobeCanvas({
  onHover,
  onEezHover,
  onAoiHover,
  onEventHover,
  onSatelliteHover,
  onSelect,
  onViewportChange,
}: GlobeCanvasProps) {
  const stores = useStores();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep the latest callbacks reachable from the (run-once) effect.
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onEezHoverRef = useRef(onEezHover);
  onEezHoverRef.current = onEezHover;
  const onAoiHoverRef = useRef(onAoiHover);
  onAoiHoverRef.current = onAoiHover;
  const onEventHoverRef = useRef(onEventHover);
  onEventHoverRef.current = onEventHover;
  const onSatelliteHoverRef = useRef(onSatelliteHover);
  onSatelliteHoverRef.current = onSatelliteHover;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const globe = stores.globe;
    const pingStore = stores.ping;
    const layerStore = stores.layers;
    const eventStore = stores.event;
    const satelliteStore = stores.satellite;
    const aoiStore = stores.aoi;
    const projection = geoOrthographic().precision(0.1);
    const path = geoPath(projection, ctx);

    let width = 0;
    let height = 0;
    let baseRadius = 0;
    // Accumulated simulated orbital time; only advances while the globe spins.
    let satClockMs = 0;

    // Cursor position (canvas-relative) and the currently hovered ping.
    const mouse = { x: 0, y: 0, inside: false };
    let hoveredMmsi: string | null = null;
    // Identity of the hovered ping (mmsi + ts) so moving between two pings of
    // the same vessel still refreshes the tooltip.
    let hoveredKey: string | null = null;
    // Name of the hovered EEZ boundary (for change detection).
    let eezHoveredName: string | null = null;
    // Identity of the hovered event marker (for change detection).
    let eventHoveredKey: string | null = null;
    // Identity of the hovered satellite (name + ping/coverage, for change detection).
    let satHoveredKey: string | null = null;
    // Id of the hovered AOI (for change detection).
    let aoiHoveredId: string | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = container.clientWidth;
      height = container.clientHeight;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      baseRadius = Math.min(width, height) / 2 - 16;
      projection.translate([width / 2, height / 2]);
    };

    const draw = () => {
      projection
        .rotate([globe.rotationLambda, globe.rotationPhi, 0])
        .scale(baseRadius * globe.zoom);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = baseRadius * globe.zoom;

      // Atmospheric glow — a soft halo around the sphere's rim.
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.16);
      glow.addColorStop(0, `rgba(${COLORS.atmosphere}, 0)`);
      glow.addColorStop(0.55, `rgba(${COLORS.atmosphere}, 0.22)`);
      glow.addColorStop(1, `rgba(${COLORS.atmosphere}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.16, 0, 2 * Math.PI);
      ctx.fillStyle = glow;
      ctx.fill();

      // Basemap sphere (ocean).
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = COLORS.ocean;
      ctx.fill();

      // Latitude/longitude grid (graticule).
      if (globe.showGraticule) {
        ctx.beginPath();
        path(graticule);
        ctx.strokeStyle = COLORS.graticule;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }

      // Land fill.
      ctx.beginPath();
      path(land);
      ctx.fillStyle = COLORS.land;
      ctx.fill();

      // Country boundaries.
      ctx.beginPath();
      path(boundaries);
      ctx.strokeStyle = COLORS.boundary;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Exclusive Economic Zone boundaries, colored by LINE_TYPE.
      if (globe.showEez) {
        loadEez();
        if (eezGroups) {
          ctx.lineWidth = 2;
          for (const group of eezGroups) {
            ctx.beginPath();
            path(group.collection);
            ctx.strokeStyle = group.color;
            ctx.stroke();
          }
        }
      }

      // Sphere outline.
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Areas of interest: committed polygons (filled) + the in-progress draft.
      // When the Library is open, the user's saved AOIs are drawn too.
      const aoiCenter: [number, number] = [-globe.rotationLambda, -globe.rotationPhi];
      const aoiSource = aoiStore.libraryOpen
        ? [...aoiStore.aois, ...aoiStore.library]
        : aoiStore.aois;
      const seenAoi = new Set<string>();
      const addedAoiIds = new Set(aoiStore.aois.map((a) => a.id));
      for (const aoi of aoiSource) {
        if (aoi.coordinates.length < 3 || seenAoi.has(aoi.id)) continue;
        seenAoi.add(aoi.id);
        const added = addedAoiIds.has(aoi.id);
        const ring = [...aoi.coordinates, aoi.coordinates[0]];
        ctx.beginPath();
        path({ type: 'Polygon', coordinates: [ring] });
        ctx.fillStyle = added ? AOI_ADDED_FILL : AOI_FILL;
        ctx.fill();
        ctx.strokeStyle = added ? AOI_ADDED_STROKE : AOI_STROKE;
        ctx.lineWidth = added ? 2 : 1.6;
        ctx.stroke();
      }

      if (aoiStore.drawing && aoiStore.draftPoints.length > 0) {
        const pts = aoiStore.draftPoints;
        // Placed edges.
        if (pts.length >= 2) {
          ctx.beginPath();
          path({ type: 'LineString', coordinates: pts });
          ctx.strokeStyle = AOI_DRAFT_STROKE;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        // Rubber-band edge from the last vertex to the cursor.
        if (mouse.inside && projection.invert) {
          const cursorGeo = projection.invert([mouse.x, mouse.y]);
          if (cursorGeo) {
            ctx.beginPath();
            path({ type: 'LineString', coordinates: [pts[pts.length - 1], cursorGeo] });
            ctx.strokeStyle = AOI_DRAFT_HINT;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
        // Vertex dots; the first vertex gets a ring once the polygon is closeable.
        pts.forEach((p, index) => {
          if (geoDistance(p, aoiCenter) > Math.PI / 2) return; // far side
          const proj = projection(p);
          if (!proj) return;
          const first = index === 0;
          ctx.beginPath();
          ctx.arc(proj[0], proj[1], first ? 5 : 3, 0, 2 * Math.PI);
          ctx.fillStyle = first ? AOI_DRAFT_STROKE : '#ffffff';
          ctx.fill();
          if (first && pts.length >= 3) {
            ctx.beginPath();
            ctx.arc(proj[0], proj[1], 9, 0, 2 * Math.PI);
            ctx.strokeStyle = AOI_DRAFT_STROKE;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        });
      }

      // Point markers, drawn on top with a fixed pixel size. The centre of the
      // visible hemisphere is [-lambda, -phi]; markers more than 90° away are
      // on the far side of the globe and get skipped.
      const center: [number, number] = [-globe.rotationLambda, -globe.rotationPhi];
      // Active time window (client-side filter for tracks + events).
      const winStart = Date.parse(pingStore.windowStart);
      const winEnd = Date.parse(pingStore.windowEnd);
      for (const marker of markers) {
        const coordinates = marker.geometry.coordinates as [number, number];
        if (geoDistance(coordinates, center) > Math.PI / 2) continue;
        const projected = projection(coordinates);
        if (!projected) continue;
        const [x, y] = projected;
        ctx.beginPath();
        ctx.arc(x, y, MARKER_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = COLORS.marker;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = COLORS.markerOutline;
        ctx.stroke();
      }

      // Hover hit-testing shared by every ping dot (track + latest pings).
      const checkHover = mouse.inside && !dragging;
      let nearest: PingHover | null = null;
      let nearestDist2 = HOVER_RADIUS * HOVER_RADIUS;

      // Loaded vessel tracks, drawn as individual pings (no lines). Part of the
      // Device-tracks layer.
      if (layerStore.deviceTracksVisible) {
        for (const tr of pingStore.tracks) {
          ctx.fillStyle = colorForMmsi(tr.mmsi);
          for (const point of tr.points) {
            const pt = Date.parse(point.ts);
            if (pt < winStart || pt > winEnd) continue;
            const coordinates: [number, number] = [point.lon, point.lat];
            if (geoDistance(coordinates, center) > Math.PI / 2) continue;
            const projected = projection(coordinates);
            if (!projected) continue;
            const [x, y] = projected;
            ctx.beginPath();
            ctx.arc(x, y, PING_RADIUS, 0, 2 * Math.PI);
            ctx.fill();

            if (checkHover) {
              const dx = x - mouse.x;
              const dy = y - mouse.y;
              const dist2 = dx * dx + dy * dy;
              if (dist2 < nearestDist2) {
                nearestDist2 = dist2;
                nearest = { mmsi: tr.mmsi, x, y, ts: point.ts, heading: point.heading };
              }
            }
          }
        }
      }

      // Job device-tracks full paths (loaded via the layer's path button),
      // drawn as individual pings under the configured 'device-tracks' layer.
      if (layerStore.isLayerVisible('device-tracks')) {
        for (const tr of pingStore.jobTracks) {
          ctx.fillStyle = colorForMmsi(tr.mmsi);
          for (const point of tr.points) {
            const pt = Date.parse(point.ts);
            if (pt < winStart || pt > winEnd) continue;
            const coordinates: [number, number] = [point.lon, point.lat];
            if (geoDistance(coordinates, center) > Math.PI / 2) continue;
            const projected = projection(coordinates);
            if (!projected) continue;
            const [x, y] = projected;
            ctx.beginPath();
            ctx.arc(x, y, PING_RADIUS, 0, 2 * Math.PI);
            ctx.fill();

            if (checkHover) {
              const dx = x - mouse.x;
              const dy = y - mouse.y;
              const dist2 = dx * dx + dy * dy;
              if (dist2 < nearestDist2) {
                nearestDist2 = dist2;
                nearest = { mmsi: tr.mmsi, x, y, ts: point.ts, heading: point.heading };
              }
            }
          }
        }
      }

      // Latest vessel pings (the "pings" sublayer of Device tracks).
      if (layerStore.pingsActive) {
        for (const ping of pingStore.pings) {
          const coordinates: [number, number] = [ping.lon, ping.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;

          ctx.beginPath();
          ctx.arc(x, y, RECENT_PING_RADIUS, 0, 2 * Math.PI);
          ctx.fillStyle = colorForMmsi(ping.mmsi);
          ctx.fill();

          if (checkHover) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < nearestDist2) {
              nearestDist2 = dist2;
              nearest = { mmsi: ping.mmsi, x, y, ts: ping.ts, heading: ping.heading };
            }
          }
        }
      }

      // AOI-bounded device tracks from a job (separate from the global pings
      // layer above; controlled by the configured 'device-tracks' layer toggle).
      if (layerStore.isLayerVisible('device-tracks')) {
        for (const ping of pingStore.aoiPings) {
          const coordinates: [number, number] = [ping.lon, ping.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;

          ctx.beginPath();
          ctx.arc(x, y, RECENT_PING_RADIUS, 0, 2 * Math.PI);
          ctx.fillStyle = colorForMmsi(ping.mmsi);
          ctx.fill();

          if (checkHover) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < nearestDist2) {
              nearestDist2 = dist2;
              nearest = { mmsi: ping.mmsi, x, y, ts: ping.ts, heading: ping.heading };
            }
          }
        }
      }

      // Highlight the hovered ping on top (its own color, larger, white ring).
      if (nearest) {
        ctx.beginPath();
        ctx.arc(nearest.x, nearest.y, PING_RADIUS + 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = colorForMmsi(nearest.mmsi);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = COLORS.pingHoverRing;
        ctx.stroke();
      }

      // Glowing pulse on selected/highlighted vessels: each dot breathes from
      // 1× to 4× the ping size and back, once per second.
      if (layerStore.deviceTracksVisible && pingStore.highlightMmsis.length > 0) {
        const byMmsi = new Map(pingStore.pings.map((p) => [p.mmsi, p]));
        const pulse = (1 - Math.cos(((performance.now() % 1000) / 1000) * 2 * Math.PI)) / 2;
        const radius = RECENT_PING_RADIUS * (1 + 3 * pulse);
        for (const hm of pingStore.highlightMmsis) {
          const hp = byMmsi.get(hm);
          if (!hp) continue;
          const coordinates: [number, number] = [hp.lon, hp.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [hx, hy] = projected;
          const color = colorForMmsi(hm);

          ctx.save();
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(hx, hy, radius, 0, 2 * Math.PI);
          ctx.fillStyle = colorForMmsiAlpha(hm, 0.2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Event markers (geofence squares + AIS-off triangles) share one nearest
      // hit-test so the tooltip picks whichever is closest to the cursor.
      let nearestEvent: EventHover | null = null;
      let nearestEventDist2 = EVENT_HOVER_RADIUS * EVENT_HOVER_RADIUS;

      // Geofence enter/exit events: fixed-size red square icons.
      if (layerStore.geofenceVisible && geofenceIconReady) {
        const half = GEOFENCE_ICON_SIZE / 2;
        for (const ev of eventStore.geofence) {
          const et = Date.parse(ev.ts);
          if (et < winStart || et > winEnd) continue;
          const coordinates: [number, number] = [ev.lon, ev.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;
          ctx.drawImage(geofenceIconCanvas, x - half, y - half, GEOFENCE_ICON_SIZE, GEOFENCE_ICON_SIZE);

          if (checkHover) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < nearestEventDist2) {
              nearestEventDist2 = dist2;
              nearestEvent = { event: ev, x, y };
            }
          }
        }
      }

      // AIS-off (gap) events: fixed-size orange triangles.
      if (layerStore.aisOffVisible) {
        const s = AIS_OFF_SIZE;
        for (const ev of eventStore.aisOff) {
          const et = Date.parse(ev.ts);
          if (et < winStart || et > winEnd) continue;
          const coordinates: [number, number] = [ev.lon, ev.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;
          ctx.beginPath();
          ctx.moveTo(x, y - s * 0.6);
          ctx.lineTo(x - s * 0.55, y + s * 0.45);
          ctx.lineTo(x + s * 0.55, y + s * 0.45);
          ctx.closePath();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = AIS_OFF_COLOR;
          ctx.stroke();

          if (checkHover) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < nearestEventDist2) {
              nearestEventDist2 = dist2;
              nearestEvent = { event: ev, x, y };
            }
          }
        }
      }

      // Capture-coverage strips: for satellites with the coverage toggle on, a
      // semitransparent ground footprint under the satellite, aligned with its
      // ground track and moving with it. Drawn as a planar quad from the four
      // projected corners (a spherical polygon fill is winding-sensitive and
      // can invert to cover the whole globe), skipped when on the far side.
      // Master visibility for the whole satellite layer (eye toggle in widget).
      const satVisible = satelliteStore.visible;
      ctx.lineWidth = 1;
      let coverageHover: SatelliteHover | null = null;
      for (const sat of satelliteStore.satellites) {
        if (!satVisible || !satelliteStore.chasingOn.has(sat.name)) continue;
        const period = sat.orbitalPeriodMin ?? 0;
        const advanceDeg = period > 0 ? (360 * satClockMs) / (period * 60_000) : 0;
        const u = (sat.meanAnomalyDeg ?? 0) + advanceDeg;
        const [lon0, lat0] = subSatellitePoint(sat.raanDeg ?? 0, sat.inclinationDeg ?? 0, u);
        // Footprint centre on the far hemisphere → hidden behind the Earth.
        if (geoDistance([lon0, lat0], center) > Math.PI / 2) continue;
        // Heading from a point a little further along the orbit.
        const [lon1, lat1] = subSatellitePoint(sat.raanDeg ?? 0, sat.inclinationDeg ?? 0, u + 0.2);
        const heading = initialBearing(lat0, lon0, lat1, lon1);
        const halfLen = COVERAGE_LENGTH_KM / 2;
        const halfWid = (sat.swathWidthKm ?? COVERAGE_DEFAULT_WIDTH_KM) / 2;
        const [fLon, fLat] = destinationPoint(lat0, lon0, heading, halfLen);
        const [bLon, bLat] = destinationPoint(lat0, lon0, heading + 180, halfLen);
        const corners = [
          destinationPoint(fLat, fLon, heading + 90, halfWid),
          destinationPoint(fLat, fLon, heading - 90, halfWid),
          destinationPoint(bLat, bLon, heading - 90, halfWid),
          destinationPoint(bLat, bLon, heading + 90, halfWid),
        ];
        const screen: [number, number][] = [];
        for (const [clon, clat] of corners) {
          const p = projection([clon, clat]);
          if (p) screen.push([p[0], p[1]]);
        }
        if (screen.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(screen[0][0], screen[0][1]);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i][0], screen[i][1]);
        ctx.closePath();
        ctx.fillStyle = COVERAGE_FILL;
        ctx.fill();
        ctx.strokeStyle = COVERAGE_STROKE;
        ctx.stroke();

        if (checkHover && !coverageHover && pointInPolygon(mouse.x, mouse.y, screen)) {
          const area = (sat.swathWidthKm ?? COVERAGE_DEFAULT_WIDTH_KM) * COVERAGE_LENGTH_KM;
          coverageHover = { satellite: sat, area, x: mouse.x, y: mouse.y };
        }
      }

      // Satellite orbits (for satellites whose orbit toggle is on): a full
      // circle traced at altitude, broken where it passes behind the Earth.
      ctx.lineWidth = 1;
      ctx.strokeStyle = SATELLITE_ORBIT_COLOR;
      for (const sat of satelliteStore.satellites) {
        if (!satVisible || !satelliteStore.orbitOn.has(sat.name)) continue;
        const rho = (EARTH_RADIUS_KM + (sat.altitudeKm ?? 0)) / EARTH_RADIUS_KM;
        ctx.beginPath();
        let penDown = false;
        for (let k = 0; k <= ORBIT_SAMPLES; k++) {
          const u = (360 * k) / ORBIT_SAMPLES;
          const [lon, lat] = subSatellitePoint(sat.raanDeg ?? 0, sat.inclinationDeg ?? 0, u);
          const projected = projection([lon, lat]);
          if (!projected) {
            penDown = false;
            continue;
          }
          const [sx, sy] = projected;
          const front = geoDistance([lon, lat], center) <= Math.PI / 2;
          if (!front && rho * Math.hypot(sx - cx, sy - cy) < radius) {
            penDown = false; // hidden behind the Earth
            continue;
          }
          const x = cx + rho * (sx - cx);
          const y = cy + rho * (sy - cy);
          if (penDown) {
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x, y);
            penDown = true;
          }
        }
        ctx.stroke();
      }

      // Satellites: green pings floating above the surface, drawn to scale.
      // They only advance along their orbits while the globe is spinning; the
      // selected one pulses and glows.
      const selectedSat = satelliteStore.selectedName;
      const satPulse = (1 - Math.cos(((performance.now() % 1000) / 1000) * 2 * Math.PI)) / 2;
      let nearestSatHover: SatelliteHover | null = null;
      let nearestSatDist2 = SATELLITE_HOVER_RADIUS * SATELLITE_HOVER_RADIUS;
      for (const sat of satelliteStore.satellites) {
        if (!satVisible) break;
        const rho = (EARTH_RADIUS_KM + (sat.altitudeKm ?? 0)) / EARTH_RADIUS_KM;
        const period = sat.orbitalPeriodMin ?? 0;
        const advanceDeg = period > 0 ? (360 * satClockMs) / (period * 60_000) : 0;
        const u = (sat.meanAnomalyDeg ?? 0) + advanceDeg;
        const [lon, lat] = subSatellitePoint(sat.raanDeg ?? 0, sat.inclinationDeg ?? 0, u);
        const projected = projection([lon, lat]);
        if (!projected) continue;
        const [sx, sy] = projected;
        // Orthographic is a parallel projection: a point at radius ρ projects to
        // ρ× the surface point's offset from the globe centre.
        const x = cx + rho * (sx - cx);
        const y = cy + rho * (sy - cy);
        // Hide satellites that are behind the Earth and inside its silhouette.
        const front = geoDistance([lon, lat], center) <= Math.PI / 2;
        if (!front && rho * Math.hypot(sx - cx, sy - cy) < radius) continue;

        if (sat.name === selectedSat) {
          ctx.save();
          ctx.shadowColor = SATELLITE_COLOR;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(x, y, SATELLITE_RADIUS * (1 + 3 * satPulse), 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(34, 227, 106, 0.25)';
          ctx.fill();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(x, y, SATELLITE_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = SATELLITE_COLOR;
        ctx.fill();

        if (checkHover) {
          const dx = x - mouse.x;
          const dy = y - mouse.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < nearestSatDist2) {
            nearestSatDist2 = dist2;
            nearestSatHover = { satellite: sat, area: null, x, y };
          }
        }
      }

      // Satellite hover: a ping wins over a coverage strip. Emit on change.
      const satHover = nearestSatHover ?? coverageHover;
      const nextSatKey = satHover
        ? `${satHover.satellite.name}|${satHover.area == null ? 'ping' : 'cov'}`
        : null;
      if (nextSatKey !== satHoveredKey) {
        satHoveredKey = nextSatKey;
        onSatelliteHoverRef.current?.(satHover);
      }

      // Notify when the hovered ping changes (keyed on mmsi + timestamp so
      // moving between pings of the same track refreshes the tooltip).
      const nextKey = nearest ? `${nearest.mmsi}|${nearest.ts}` : null;
      if (nextKey !== hoveredKey) {
        hoveredKey = nextKey;
        hoveredMmsi = nearest ? nearest.mmsi : null;
        onHoverRef.current?.(nearest);
      }

      // Event hover (below pings in priority).
      const activeEvent = nearest ? null : nearestEvent;
      const nextEventKey = activeEvent
        ? `${activeEvent.event.mmsi}|${activeEvent.event.ts}|${activeEvent.event.eventType}`
        : null;
      if (nextEventKey !== eventHoveredKey) {
        eventHoveredKey = nextEventKey;
        onEventHoverRef.current?.(activeEvent);
      }

      // AOI hover (below pings/events). Hit-test the polygon under the cursor.
      let aoiHover: AoiHover | null = null;
      let aoiHoverId: string | null = null;
      if (checkHover && !nearest && !activeEvent && projection.invert) {
        const geo = projection.invert([mouse.x, mouse.y]);
        const hitId = geo ? aoiStore.hitTest([geo[0], geo[1]]) : null;
        if (hitId) {
          const a =
            aoiStore.aois.find((x) => x.id === hitId) ??
            aoiStore.library.find((x) => x.id === hitId);
          if (a) {
            aoiHoverId = hitId;
            aoiHover = { name: a.name, areaKm2: a.areaKm2, x: mouse.x, y: mouse.y };
          }
        }
      }
      if (aoiHoverId !== aoiHoveredId) {
        aoiHoveredId = aoiHoverId;
        onAoiHoverRef.current?.(aoiHover);
      }

      // EEZ boundary hover (only when no ping, event or AOI is under the cursor).
      // Find the nearest boundary vertex by planar distance, then confirm it's
      // within a few pixels on screen.
      let eezName: string | null = null;
      if (
        globe.showEez &&
        checkHover &&
        !nearest &&
        !activeEvent &&
        !aoiHover &&
        eezPoints &&
        projection.invert
      ) {
        const geo = projection.invert([mouse.x, mouse.y]);
        if (geo) {
          const [glon, glat] = geo;
          const cosLat = Math.cos((glat * Math.PI) / 180);
          let best: EezPoint | null = null;
          let bestD2 = Infinity;
          for (const p of eezPoints) {
            let dlon = p.lon - glon;
            if (dlon > 180) dlon -= 360;
            else if (dlon < -180) dlon += 360;
            dlon *= cosLat;
            const dlat = p.lat - glat;
            const d2 = dlat * dlat + dlon * dlon;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = p;
            }
          }
          if (best) {
            const proj = projection([best.lon, best.lat]);
            if (proj) {
              const dx = proj[0] - mouse.x;
              const dy = proj[1] - mouse.y;
              if (dx * dx + dy * dy <= EEZ_HOVER_RADIUS * EEZ_HOVER_RADIUS) {
                eezName = best.name;
              }
            }
          }
        }
      }
      if (eezName !== eezHoveredName) {
        eezHoveredName = eezName;
        onEezHoverRef.current?.(eezName ? { name: eezName, x: mouse.x, y: mouse.y } : null);
      }
    };

    resize();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(container);

    // --- Drag-to-rotate (mouse / single-finger trackpad click-drag) ---
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    // Click detection: ping under the cursor at press, and whether it moved.
    let pressedMmsi: string | null = null;
    let downX = 0;
    let downY = 0;
    let didDrag = false;

    const clearHover = () => {
      if (hoveredKey !== null) {
        hoveredKey = null;
        hoveredMmsi = null;
        onHoverRef.current?.(null);
      }
    };

    // Invert a canvas point to [lon, lat], using the current view. Returns null
    // when the point falls outside the globe disk.
    const screenToLonLat = (px: number, py: number): [number, number] | null => {
      projection.rotate([globe.rotationLambda, globe.rotationPhi, 0]).scale(baseRadius * globe.zoom);
      const inv = projection.invert?.([px, py]);
      return inv ? [inv[0], inv[1]] : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      downX = event.clientX;
      downY = event.clientY;
      didDrag = false;
      // Remember the ping under the cursor for click-to-select.
      pressedMmsi = hoveredMmsi;
      // Cancel any fly-to while grabbing, and drop hover. Auto-spin is left on
      // — it just pauses for the duration of the drag (see the tick) and
      // resumes on release, so grabbing the globe never stops the animation.
      globe.cancelFlight();
      clearHover();
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      // Always track the cursor for hover hit-testing.
      mouse.x = event.offsetX;
      mouse.y = event.offsetY;
      mouse.inside = true;

      if (!dragging) {
        canvas.style.cursor = aoiStore.drawing ? 'crosshair' : 'grab';
        return;
      }
      if (Math.abs(event.clientX - downX) > 4 || Math.abs(event.clientY - downY) > 4) {
        didDrag = true;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      const k = DRAG_SENSITIVITY / globe.zoom;
      globe.rotateBy(dx * k, -dy * k);
    };

    const onPointerLeave = () => {
      mouse.inside = false;
      clearHover();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = aoiStore.drawing ? 'crosshair' : 'grab';

      // Draw mode: a click adds a vertex, or closes the polygon when it lands
      // on the first vertex. Dragging rotates the globe and adds nothing.
      if (aoiStore.drawing) {
        if (!didDrag) {
          const pts = aoiStore.draftPoints;
          if (pts.length >= 3) {
            const firstProj = projection(pts[0]);
            if (
              firstProj &&
              Math.hypot(firstProj[0] - event.offsetX, firstProj[1] - event.offsetY) <=
                AOI_CLOSE_RADIUS_PX
            ) {
              aoiStore.finishDrawing();
              pressedMmsi = null;
              return;
            }
          }
          const geo = screenToLonLat(event.offsetX, event.offsetY);
          if (geo) aoiStore.addPoint(geo[0], geo[1]);
        }
        pressedMmsi = null;
        return;
      }

      // A press-release with no real drag is a click. A ping under the cursor
      // wins; otherwise hit-test the AOIs and select/deselect.
      if (!didDrag) {
        if (pressedMmsi) {
          onSelectRef.current?.(pressedMmsi);
        } else {
          // Selecting another AOI switches selection; clicking empty space
          // keeps the current selection.
          const geo = screenToLonLat(event.offsetX, event.offsetY);
          const hit = geo ? aoiStore.hitTest(geo) : null;
          if (hit) aoiStore.selectAoi(hit);
        }
      }
      pressedMmsi = null;
    };

    // Zoom while keeping the geographic point under the cursor fixed on screen.
    // For an orthographic globe this means rotating the sphere so the anchor
    // point stays put as the scale changes (a screen translate would slide the
    // globe off the centred glow/markers). Solved exactly in 2 DOF — no roll.
    const DEG = 180 / Math.PI;
    const zoomAtPointer = (px: number, py: number, factor: number) => {
      // Geo coords currently under the cursor, before the scale changes.
      projection
        .rotate([globe.rotationLambda, globe.rotationPhi, 0])
        .scale(baseRadius * globe.zoom);
      const anchor = projection.invert?.([px, py]);

      globe.zoomBy(factor);

      // Cursor off the globe → nothing to anchor, a plain zoom is all we can do.
      if (!anchor) return;

      const s = baseRadius * globe.zoom;
      // Target on-screen offset from centre, in sphere-radius units, with the
      // canvas y-axis flipped to point up (matches d3's orthographic raw).
      const a = (px - width / 2) / s;
      const b = (height / 2 - py) / s;
      if (a * a + b * b > 1) return; // anchor would fall outside the disk

      const lonP = anchor[0] / DEG;
      const latP = anchor[1] / DEG;
      const cosLatP = Math.cos(latP);
      if (Math.abs(cosLatP) < 1e-6) return; // anchored on a pole
      const sinL1 = a / cosLatP;
      if (Math.abs(sinL1) > 1) return; // this latitude can't reach the cursor

      // Keep the same hemisphere (front-facing) branch we're currently on.
      const frontSign = Math.cos(lonP + globe.rotationLambda / DEG) >= 0 ? 1 : -1;
      const xHoriz = frontSign * Math.sqrt(Math.max(0, cosLatP * cosLatP - a * a));
      const lambda1 = Math.atan2(sinL1, xHoriz / cosLatP);
      const zP = Math.sin(latP);
      const front = Math.sqrt(Math.max(0, 1 - a * a - b * b));
      const dPhi = Math.atan2(b, front) - Math.atan2(zP, xHoriz);

      globe.setRotation((lambda1 - lonP) * DEG, dPhi * DEG);
    };

    // --- Trackpad: two fingers zoom (one finger pans via pointer drag) ---
    // Two-finger scroll arrives as a plain wheel event; a pinch arrives as
    // ctrl+wheel (smaller deltas). Both map to zoom, anchored at the cursor.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.ctrlKey ? 0.01 : 0.002;
      zoomAtPointer(event.offsetX, event.offsetY, Math.exp(-event.deltaY * factor));
    };

    // Esc cancels an in-progress AOI draft.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && aoiStore.drawing) aoiStore.cancelDrawing();
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    // --- Viewport reporting: emit the visible cap after the view settles ---
    let lastViewKey = '';
    let viewChangedAt = 0;
    let viewDirty = true;
    let lastEmittedKey = '';

    const emitViewport = () => {
      if (!onViewportChangeRef.current || baseRadius <= 0) return;
      const scale = baseRadius * globe.zoom;
      const halfDiag = Math.hypot(width / 2, height / 2);
      const ratio = halfDiag / scale;
      const alpha = ratio >= 1 ? Math.PI / 2 : Math.asin(ratio);
      // 25% margin so small moves don't refetch; capped at a hemisphere.
      const radius = Math.min(Math.PI / 2, alpha * 1.25) * EARTH_RADIUS_M;
      onViewportChangeRef.current({
        lon: -globe.rotationLambda,
        lat: -globe.rotationPhi,
        radius,
        maxBucket: sampleBucket(globe.zoom),
      });
    };

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // Pause auto-spin while dragging or hovering a ping so it stays readable.
      // Earth rotation and satellite orbits share one real-time clock (real
      // time at 1×); the playback speed multiplier scales both equally, so
      // their relative rates stay physically correct.
      if (globe.spinning && !dragging && hoveredMmsi === null && !aoiStore.drawing) {
        const scaled = dt * (globe.speed || 1);
        globe.advanceSpin(scaled);
        satClockMs += scaled;
      }
      if (!dragging) {
        globe.flyStep(dt);
      }
      draw();

      // Detect view changes (rounded) and emit the cap once they settle (~300ms).
      const viewKey = `${globe.rotationLambda.toFixed(0)},${globe.rotationPhi.toFixed(0)},${globe.zoom.toFixed(2)}`;
      if (viewKey !== lastViewKey) {
        lastViewKey = viewKey;
        viewChangedAt = now;
        viewDirty = true;
      } else if (viewDirty && now - viewChangedAt > 300 && viewKey !== lastEmittedKey) {
        viewDirty = false;
        lastEmittedKey = viewKey;
        emitViewport();
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [stores]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
