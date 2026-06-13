import { useEffect, useRef } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { FeatureCollection } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

import countries110m from 'world-atlas/countries-110m.json';

const topology = countries110m as unknown as Topology;
const countriesObject = topology.objects.countries as GeometryCollection;
const land = feature(topology, countriesObject) as unknown as FeatureCollection;
const boundaries = mesh(topology, countriesObject);
const graticule = geoGraticule10();

const COLORS = {
  ocean: '#0f141b',
  land: '#3b4250',
  boundary: '#525a68',
  graticule: 'rgba(120, 170, 255, 0.08)',
  atmosphere: '120, 170, 255',
  satellite: '180, 210, 255',
};

// One rotation per minute = 6 degrees per second.
const DEG_PER_MS = 360 / 60_000;

// View tilt (north pole leans toward the viewer), in radians — matches the
// projection's rotate([lambda, -18, 0]).
const TILT = (18 * Math.PI) / 180;

interface Sat {
  /** Longitude at t=0, radians. */
  lon0: number;
  /** Latitude, radians. */
  lat: number;
  /** Orbit radius as a multiple of the globe radius (>1 = above surface). */
  alt: number;
  /** Per-satellite angular speed multiplier (parallax). */
  speed: number;
}

/** A fixed cloud of satellites at varied longitudes, latitudes and altitudes. */
function makeSatellites(count: number): Sat[] {
  const sats: Sat[] = [];
  for (let i = 0; i < count; i += 1) {
    sats.push({
      lon0: Math.random() * 2 * Math.PI,
      lat: ((Math.random() * 2 - 1) * 72 * Math.PI) / 180,
      alt: 1.12 + Math.random() * 0.42,
      speed: 0.6 + Math.random() * 0.9,
    });
  }
  return sats;
}

/**
 * Decorative, non-interactive globe for the landing page: grey basemap +
 * country boundaries auto-rotating at 1rpm, with a soft atmospheric glow.
 */
export function SpinningGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let lambda = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;

    const projection = geoOrthographic().clipAngle(90).rotate([0, -18, 0]);
    const path = geoPath(projection, ctx);
    const satellites = makeSatellites(7000);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const radius = Math.min(width, height) / 2 - 8;
      projection.scale(radius).translate([width / 2, height / 2]);
    };

    const draw = (now: number) => {
      lambda = (lambda + (now - last) * DEG_PER_MS) % 360;
      last = now;
      projection.rotate([lambda, -18, 0]);

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 8;

      // Atmospheric glow.
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.18);
      glow.addColorStop(0, `rgba(${COLORS.atmosphere}, 0)`);
      glow.addColorStop(0.55, `rgba(${COLORS.atmosphere}, 0.22)`);
      glow.addColorStop(1, `rgba(${COLORS.atmosphere}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.18, 0, 2 * Math.PI);
      ctx.fillStyle = glow;
      ctx.fill();

      // Ocean sphere.
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = COLORS.ocean;
      ctx.fill();

      // Graticule.
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = COLORS.graticule;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Land.
      ctx.beginPath();
      path(land);
      ctx.fillStyle = COLORS.land;
      ctx.fill();

      // Country boundaries.
      ctx.beginPath();
      path(boundaries);
      ctx.strokeStyle = COLORS.boundary;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Satellite cloud: 3D points on orbit shells, spinning with the globe.
      const spin = (lambda * Math.PI) / 180;
      for (const sat of satellites) {
        const lon = sat.lon0 + spin * sat.speed;
        const cosLat = Math.cos(sat.lat);
        // Unit position on the orbit sphere.
        const x = cosLat * Math.sin(lon);
        const y0 = Math.sin(sat.lat);
        const z0 = cosLat * Math.cos(lon);
        // Apply the view tilt about the x-axis.
        const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT);
        const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);

        const px = cx + radius * sat.alt * x;
        const py = cy - radius * sat.alt * y;
        const distFromCenter = radius * sat.alt * Math.hypot(x, y);

        // Behind the globe and within its disk → occluded.
        if (z < 0 && distFromCenter < radius) continue;

        const front = z >= 0;
        const size = front ? 0.9 : 0.6;
        const alpha = front ? 0.95 : 0.4;

        if (front) {
          ctx.beginPath();
          ctx.arc(px, py, size * 2.4, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(${COLORS.satellite}, 0.12)`;
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(px, py, size, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(${COLORS.satellite}, ${alpha})`;
        ctx.fill();
      }

      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    last = performance.now();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="spinning-globe" />;
}
