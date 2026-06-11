import { useEffect, useRef } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

import countries110m from 'world-atlas/countries-110m.json';
import { useStores } from '../stores/StoreContext';
import { colorForMmsi, colorForMmsiAlpha } from '../utils/colorMap';

// Pre-compute the geometry once at module load — it never changes.
const topology = countries110m as unknown as Topology;
const countriesObject = topology.objects.countries as GeometryCollection;
const land = feature(topology, countriesObject) as unknown as FeatureCollection;
const boundaries = mesh(topology, countriesObject);
const graticule = geoGraticule10();

// Grey palette for the basemap.
const COLORS = {
  ocean: '#2a2f37',
  land: '#3b4250',
  boundary: '#828b99',
  graticule: 'rgba(170, 185, 205, 0.45)',
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
const MARKER_RADIUS = 5;

// Ping marker radius and the pixel distance within which a ping is "hovered".
const PING_RADIUS = 2.5;
const HOVER_RADIUS = 8;

/** A ping currently under the cursor, with its on-screen position. */
export interface PingHover {
  mmsi: string;
  x: number;
  y: number;
  ts: string;
  heading: number | null;
}

interface GlobeCanvasProps {
  /** Called when the hovered ping changes (null when nothing is hovered). */
  onHover?: (hover: PingHover | null) => void;
  /** Called when a ping is clicked (vessel MMSI). */
  onSelect?: (mmsi: string) => void;
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

export function GlobeCanvas({ onHover, onSelect }: GlobeCanvasProps) {
  const stores = useStores();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep the latest callbacks reachable from the (run-once) effect.
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const globe = stores.globe;
    const pingStore = stores.ping;
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

      // Selected vessel's full path, drawn as individual pings (no lines).
      const track = pingStore.track;
      const trackMmsi = pingStore.trackMmsi;
      if (track.length > 0) {
        ctx.fillStyle = trackMmsi ? colorForMmsi(trackMmsi) : COLORS.track;
        for (const point of track) {
          const coordinates: [number, number] = [point.lon, point.lat];
          if (geoDistance(coordinates, center) > Math.PI / 2) continue;
          const projected = projection(coordinates);
          if (!projected) continue;
          const [x, y] = projected;
          ctx.beginPath();
          ctx.arc(x, y, PING_RADIUS, 0, 2 * Math.PI);
          ctx.fill();

          if (checkHover && trackMmsi) {
            const dx = x - mouse.x;
            const dy = y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < nearestDist2) {
              nearestDist2 = dist2;
              nearest = { mmsi: trackMmsi, x, y, ts: point.ts, heading: point.heading };
            }
          }
        }
      }

      // Latest vessel pings.
      for (const ping of pingStore.pings) {
        const coordinates: [number, number] = [ping.lon, ping.lat];
        if (geoDistance(coordinates, center) > Math.PI / 2) continue;
        const projected = projection(coordinates);
        if (!projected) continue;
        const [x, y] = projected;

        ctx.beginPath();
        ctx.arc(x, y, PING_RADIUS, 0, 2 * Math.PI);
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

      // Glowing pulse on the selected vessel: its dot breathes from 1× to 4×
      // the ping size and back, once per second.
      const highlightMmsi = pingStore.highlightMmsi;
      if (highlightMmsi) {
        const hp = pingStore.pings.find((p) => p.mmsi === highlightMmsi);
        if (hp) {
          const coordinates: [number, number] = [hp.lon, hp.lat];
          if (geoDistance(coordinates, center) <= Math.PI / 2) {
            const projected = projection(coordinates);
            if (projected) {
              const [hx, hy] = projected;
              const pulse = (1 - Math.cos(((performance.now() % 1000) / 1000) * 2 * Math.PI)) / 2;
              const radius = PING_RADIUS * (1 + 3 * pulse);
              const color = colorForMmsi(highlightMmsi);

              ctx.save();
              ctx.shadowColor = color;
              ctx.shadowBlur = 14;
              ctx.beginPath();
              ctx.arc(hx, hy, radius, 0, 2 * Math.PI);
              ctx.fillStyle = colorForMmsiAlpha(highlightMmsi, 0.2);
              ctx.fill();
              ctx.restore();
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

    // --- Trackpad: two fingers zoom (one finger pans via pointer drag) ---
    // Two-finger scroll arrives as a plain wheel event; a pinch arrives as
    // ctrl+wheel (smaller deltas). Both map to zoom.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.ctrlKey ? 0.01 : 0.002;
      globe.zoomBy(Math.exp(-event.deltaY * factor));
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

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
