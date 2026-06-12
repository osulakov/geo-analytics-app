import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MIN_GAP = HOUR; // smallest selectable window

const pad = (n: number) => String(n).padStart(2, '0');

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}

interface Tick {
  frac: number;
  label: string;
}

function buildTicks(minMs: number, maxMs: number): Tick[] {
  const span = maxMs - minMs;
  if (span <= 0) return [];
  const hourly = span <= 2 * DAY;
  const step = hourly ? 6 * HOUR : Math.max(1, Math.ceil(span / DAY / 10)) * DAY;
  const ticks: Tick[] = [];
  for (let t = minMs; t <= maxMs + 1; t += step) {
    const d = new Date(t);
    const label = hourly
      ? `${pad(d.getUTCHours())}:00`
      : `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    ticks.push({ frac: (t - minMs) / span, label });
  }
  return ticks;
}

/**
 * Bottom-center time-range slider. Two handles narrow the active window within
 * the global date range; releasing a handle reloads the map for that window.
 */
export const TimeSlider = observer(function TimeSlider() {
  const { ping } = useStores();

  const minMs = useMemo(() => Date.parse(`${ping.fromDate}T00:00:00Z`), [ping.fromDate]);
  const maxMs = useMemo(() => Date.parse(`${ping.toDate}T23:59:59Z`), [ping.toDate]);

  const storeStart = Date.parse(ping.windowStart);
  const storeEnd = Date.parse(ping.windowEnd);

  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | null>(null);
  const [range, setRange] = useState<[number, number]>([storeStart, storeEnd]);

  // Client-side only — narrows the window; no DB request.
  const commit = ([from, to]: [number, number]) => {
    ping.setWindow(new Date(from).toISOString(), new Date(to).toISOString());
  };

  // Re-sync from the store when the window changes externally (and not dragging).
  useEffect(() => {
    if (!draggingRef.current) setRange([storeStart, storeEnd]);
  }, [storeStart, storeEnd]);

  const ticks = useMemo(() => buildTicks(minMs, maxMs), [minMs, maxMs]);
  const span = maxMs - minMs;
  const startFrac = span > 0 ? (range[0] - minMs) / span : 0;
  const endFrac = span > 0 ? (range[1] - minMs) / span : 1;

  const startDrag = (which: 'start' | 'end' | 'range') => (event_: React.PointerEvent) => {
    event_.preventDefault();
    draggingRef.current = which === 'range' ? 'start' : which;

    const msFromX = (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return minMs;
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return minMs + frac * span;
    };

    // Window at grab time (the non-dragged handle stays fixed).
    const [s0, e0] = range;
    const downMs = msFromX(event_.clientX);
    const width = e0 - s0;
    let latest: [number, number] = [s0, e0];

    // Update handles and the (client-side) window live on every move.
    const apply = (next: [number, number]) => {
      latest = next;
      setRange(next);
      commit(next);
    };

    const move = (e: PointerEvent) => {
      const ms = msFromX(e.clientX);
      if (which === 'start') {
        apply([Math.min(ms, e0 - MIN_GAP), e0]);
      } else if (which === 'end') {
        apply([s0, Math.max(ms, s0 + MIN_GAP)]);
      } else {
        // Translate the whole window, keeping its width and staying in bounds.
        const ns = Math.min(Math.max(s0 + (ms - downMs), minMs), maxMs - width);
        apply([ns, ns + width]);
      }
    };

    const up = () => {
      draggingRef.current = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      commit(latest);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };

  return (
    <div className="time-slider">
      <div className="time-slider__window">
        {formatDateTime(range[0])} → {formatDateTime(range[1])}
      </div>

      <div className="time-slider__track" ref={trackRef}>
        <div
          className="time-slider__range"
          style={{ left: `${startFrac * 100}%`, right: `${(1 - endFrac) * 100}%` }}
        />
        <div
          className="time-slider__range-grab"
          style={{ left: `${startFrac * 100}%`, right: `${(1 - endFrac) * 100}%` }}
          onPointerDown={startDrag('range')}
        />
        <button
          type="button"
          className="time-slider__handle"
          style={{ left: `${startFrac * 100}%` }}
          aria-label="Window start"
          onPointerDown={startDrag('start')}
        />
        <button
          type="button"
          className="time-slider__handle"
          style={{ left: `${endFrac * 100}%` }}
          aria-label="Window end"
          onPointerDown={startDrag('end')}
        />
      </div>

      <div className="time-slider__ticks">
        {ticks.map((t, i) => (
          <span key={i} className="time-slider__tick" style={{ left: `${t.frac * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
});
