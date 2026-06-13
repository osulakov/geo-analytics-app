import { useEffect, useRef } from 'react';
import { geoOrthographic } from 'd3-geo';

import earthBaseUrl from '../assets/earth-clouds.jpg';
import earthCloudUrl from '../assets/earth-cloud-layer.png';

const COLORS = {
  atmosphere: '70, 120, 225',
  satellite: '180, 210, 255',
};

// One rotation per minute = 6 degrees per second.
const DEG_PER_MS = 360 / 60_000;

// View tilt (north pole leans toward the viewer), in degrees.
const TILT_DEG = 18;
const TILT = (TILT_DEG * Math.PI) / 180;

// Cap the per-pixel render resolution so cost stays bounded on big screens;
// the result is scaled up to the display size with drawImage.
const MAX_RENDER_DIAMETER = 620;

interface Sat {
  lon0: number;
  lat: number;
  alt: number;
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
 * Decorative, non-interactive globe for the landing page: a real "Earth from
 * space" (Blue Marble) texture mapped onto an auto-rotating orthographic
 * sphere, with a soft atmospheric glow and a drifting satellite cloud.
 *
 * The texture is sampled per screen pixel by inverting the projection. Latitude
 * and the base longitude of each pixel depend only on the (fixed) tilt, so they
 * are precomputed on resize; spinning merely shifts the sampled longitude, so
 * each frame is just a texture lookup per pixel.
 */
export function SpinningGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // --- Earth texture (read once into a flat RGBA buffer) ---
    let tex: Uint8ClampedArray | null = null;
    let texW = 0;
    let texH = 0;
    // Composite the real Blue Marble base with the real cloud layer (clouds
    // PNG has transparency), once both have loaded, into one RGBA buffer.
    const baseImg = new Image();
    const cloudImg = new Image();
    const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
    const composite = () => {
      if (tex || !ready(baseImg) || !ready(cloudImg)) return;
      texW = baseImg.naturalWidth;
      texH = baseImg.naturalHeight;
      const tc = document.createElement('canvas');
      tc.width = texW;
      tc.height = texH;
      const tctx = tc.getContext('2d', { willReadFrequently: true });
      if (!tctx) return;
      tctx.drawImage(baseImg, 0, 0, texW, texH);
      tctx.globalAlpha = 0.85; // soften the cloud overlay a touch
      tctx.drawImage(cloudImg, 0, 0, texW, texH);
      tctx.globalAlpha = 1;
      tex = tctx.getImageData(0, 0, texW, texH).data;
    };
    // Attach handlers before src, and cover the already-cached case.
    baseImg.onload = composite;
    cloudImg.onload = composite;
    baseImg.src = earthBaseUrl;
    cloudImg.src = earthCloudUrl;
    composite();

    // Offscreen buffer the globe disk is rendered into, then scaled to display.
    const globeCanvas = document.createElement('canvas');
    const globeCtx = globeCanvas.getContext('2d');
    const projection = geoOrthographic().clipAngle(90).rotate([0, -TILT_DEG, 0]);
    const satellites = makeSatellites(7000);

    let frame = 0;
    let lambda = 0;
    let last = performance.now();
    let width = 0;
    let height = 0;
    let displayRadius = 0;
    // Precomputed per offscreen pixel: base longitude (deg, NaN outside disk)
    // and a latitude fraction (0 at north pole → 1 at south). Both are texture-
    // independent, so the precompute is valid even before the image loads; the
    // texture row is derived from `lat01` at sample time. Rebuilt on resize.
    let rd = 0; // offscreen render diameter (px)
    let baseLon = new Float32Array(0);
    let lat01 = new Float32Array(0);
    let frameImg: ImageData | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      displayRadius = Math.min(width, height) / 2 - 8;
      rd = Math.min(Math.round(displayRadius * 2), MAX_RENDER_DIAMETER);
      if (rd <= 0 || !globeCtx) return;

      globeCanvas.width = rd;
      globeCanvas.height = rd;
      frameImg = globeCtx.createImageData(rd, rd);

      // Precompute lat/baseLon for each offscreen pixel.
      const r = rd / 2;
      projection.scale(r - 0.5).translate([r, r]).rotate([0, -TILT_DEG, 0]);
      baseLon = new Float32Array(rd * rd);
      lat01 = new Float32Array(rd * rd);
      const r2 = (r - 0.5) * (r - 0.5);
      for (let py = 0; py < rd; py += 1) {
        for (let px = 0; px < rd; px += 1) {
          const i = py * rd + px;
          // Hard circular mask: anything outside the disk is transparent.
          const dx = px + 0.5 - r;
          const dy = py + 0.5 - r;
          const inv = dx * dx + dy * dy > r2 ? null : projection.invert?.([px + 0.5, py + 0.5]);
          if (!inv || inv[0] !== inv[0]) {
            baseLon[i] = NaN;
            continue;
          }
          baseLon[i] = inv[0];
          lat01[i] = (90 - inv[1]) / 180; // 0 (north) → 1 (south)
        }
      }
    };

    const draw = (now: number) => {
      lambda = (lambda + (now - last) * DEG_PER_MS) % 360;
      last = now;

      // Pick up the layout size as soon as it's known (the canvas can still be
      // 0×0 at mount) and on any change, without relying on resize events.
      const rect = canvas.getBoundingClientRect();
      if (rect.width !== width || rect.height !== height) resize();
      if (!frameImg || width <= 0 || height <= 0) {
        frame = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius = displayRadius;

      // Atmospheric glow.
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.96, cx, cy, radius * 1.09);
      glow.addColorStop(0, `rgba(${COLORS.atmosphere}, 0)`);
      glow.addColorStop(0.55, `rgba(${COLORS.atmosphere}, 0.5)`);
      glow.addColorStop(1, `rgba(${COLORS.atmosphere}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.09, 0, 2 * Math.PI);
      ctx.fillStyle = glow;
      ctx.fill();

      // Earth: sample the equirectangular texture per offscreen pixel.
      if (tex && frameImg && globeCtx) {
        const out = frameImg.data;
        const n = rd * rd;
        for (let i = 0; i < n; i += 1) {
          const bl = baseLon[i];
          const di = i * 4;
          if (bl !== bl) {
            out[di + 3] = 0; // outside the disk → transparent
            continue;
          }
          let lon = bl - lambda;
          lon = ((((lon + 180) % 360) + 360) % 360) / 360; // → [0, 1)
          let tx = (lon * texW) | 0;
          if (tx >= texW) tx = texW - 1;
          let row = (lat01[i] * texH) | 0;
          if (row >= texH) row = texH - 1;
          const si = (row * texW + tx) * 4;
          out[di] = tex[si];
          out[di + 1] = tex[si + 1];
          out[di + 2] = tex[si + 2];
          out[di + 3] = 255;
        }
        globeCtx.putImageData(frameImg, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(globeCanvas, cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        // Texture not ready yet: a plain dark sphere.
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#0f141b';
        ctx.fill();
      }

      // Satellite cloud: 3D points on orbit shells, spinning with the globe.
      const spin = (lambda * Math.PI) / 180;
      for (const sat of satellites) {
        const lon = sat.lon0 + spin * sat.speed;
        const cosLat = Math.cos(sat.lat);
        const x = cosLat * Math.sin(lon);
        const y0 = Math.sin(sat.lat);
        const z0 = cosLat * Math.cos(lon);
        const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT);
        const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);

        const px = cx + radius * sat.alt * x;
        const py = cy - radius * sat.alt * y;
        const distFromCenter = radius * sat.alt * Math.hypot(x, y);

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

    // Sizing is handled inside the draw loop (it picks up the layout size as
    // soon as it's available and on any change), so no resize listener here.
    last = performance.now();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="spinning-globe" />;
}
