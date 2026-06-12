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

// Red geofence-event icon (the square SVG, recolored), drawn on the canvas.
const GEOFENCE_COLOR = '#ef4444';
const GEOFENCE_ICON_SIZE = 16;
const geofenceIcon = new Image();
let geofenceIconReady = false;
geofenceIcon.onload = () => {
  geofenceIconReady = true;
};
geofenceIcon.src =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(analyticsSquareRaw.replace(/currentColor/g, GEOFENCE_COLOR));

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

/** A map event under the cursor. */
export interface EventHover {
  event: MapEvent;
  x: number;
  y: number;
}

interface GlobeCanvasProps {
  /** Called when the hovered ping changes (null when nothing is hovered). */
  onHover?: (hover: PingHover | null) => void;
  /** Called when the hovered EEZ boundary changes. */
  onEezHover?: (hover: EezHover | null) => void;
  /** Called when the hovered event marker changes. */
  onEventHover?: (hover: EventHover | null) => void;
  /** Called when a ping is clicked (vessel MMSI). */
  onSelect?: (mmsi: string) => void;
  /** Called (throttled, after the view settles) with the visible cap. */
  onViewportChange?: (cap: { lon: number; lat: number; radius: number }) => void;
}

const EARTH_RADIUS_M = 6_371_000;

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
  onEventHover,
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
  const onEventHoverRef = useRef(onEventHover);
  onEventHoverRef.current = onEventHover;
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
    const projection = geoOrthographic().precision(0.1);
    const path = geoPath(projection, ctx);

    let width = 0;
    let height = 0;
    let baseRadius = 0;

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

      // Geofence enter/exit events: fixed-size red square icons.
      let nearestEvent: EventHover | null = null;
      if (layerStore.geofenceVisible && geofenceIconReady) {
        const half = GEOFENCE_ICON_SIZE / 2;
        let nearestEventDist2 = EVENT_HOVER_RADIUS * EVENT_HOVER_RADIUS;
        for (const ev of eventStore.geofence) {
          const et = Date.parse(ev.ts);
          if (et < winStart || et > winEnd) continue;
          const coordinates: [number, number] = [ev.lon, ev.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;
          ctx.drawImage(geofenceIcon, x - half, y - half, GEOFENCE_ICON_SIZE, GEOFENCE_ICON_SIZE);

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

      // EEZ boundary hover (only when no ping or event is under the cursor). Find the
      // nearest boundary vertex by planar distance, then confirm it's within a
      // few pixels on screen.
      let eezName: string | null = null;
      if (globe.showEez && checkHover && !nearest && !activeEvent && eezPoints && projection.invert) {
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

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      downX = event.clientX;
      downY = event.clientY;
      didDrag = false;
      // Remember the ping under the cursor for click-to-select.
      pressedMmsi = hoveredMmsi;
      // Pause auto-spin / cancel any fly-to while grabbing, and drop hover.
      globe.setSpinning(false);
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

      if (!dragging) return;
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
      canvas.style.cursor = 'grab';
      // A press-release on a ping with no real drag is a click → select it.
      if (!didDrag && pressedMmsi) {
        onSelectRef.current?.(pressedMmsi);
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

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

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
      });
    };

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // Pause auto-spin while dragging or hovering a ping so it stays readable.
      if (globe.spinning && !dragging && hoveredMmsi === null) {
        globe.advanceSpin(dt);
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
    };
  }, [stores]);

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
