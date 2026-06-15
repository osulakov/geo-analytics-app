import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseYmd(s: string): Date | null {
  if (!isValidYmd(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Digits → masked YYYY-MM-DD (auto-inserts the dashes as you type). */
function mask(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 4);
  if (d.length > 4) out += `-${d.slice(4, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  return out;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Single-view month calendar with range selection. */
function RangeCalendar({
  from,
  to,
  onSelect,
}: {
  from: string;
  to: string;
  onSelect: (a: string, b: string) => void;
}) {
  const init = parseYmd(from) ?? new Date();
  const [view, setView] = useState({ year: init.getFullYear(), month: init.getMonth() });
  const [start, setStart] = useState<string | null>(from || null);
  const [end, setEnd] = useState<string | null>(to || null);
  const [hover, setHover] = useState<string | null>(null);

  const prevMonth = () =>
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  const nextMonth = () =>
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));

  const click = (ymd: string) => {
    if (!start || end) {
      setStart(ymd);
      setEnd(null);
      return;
    }
    const lo = ymd < start ? ymd : start;
    const hi = ymd < start ? start : ymd;
    setStart(lo);
    setEnd(hi);
    onSelect(lo, hi);
  };

  // Highlighted range: the committed [start, end], or a live preview to `hover`.
  let lo = start;
  let hi = end;
  if (start && !end && hover) {
    lo = hover < start ? hover : start;
    hi = hover < start ? start : hover;
  }

  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="date-range__calendar">
      <div className="date-range__cal-head">
        <button type="button" aria-label="Previous month" onClick={prevMonth}>
          ‹
        </button>
        <span>
          {MONTHS[view.month]} {view.year}
        </span>
        <button type="button" aria-label="Next month" onClick={nextMonth}>
          ›
        </button>
      </div>
      <div className="date-range__cal-grid" onMouseLeave={() => setHover(null)}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="date-range__cal-weekday">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} className="date-range__cal-cell is-empty" />;
          const ymd = toYmd(view.year, view.month, d);
          const inRange = Boolean(lo && hi && ymd >= lo && ymd <= hi);
          return (
            <button
              key={ymd}
              type="button"
              className={`date-range__cal-cell${inRange ? ' is-range' : ''}${
                ymd === lo ? ' is-start' : ''
              }${ymd === hi ? ' is-end' : ''}`}
              onClick={() => click(ymd)}
              onMouseEnter={() => setHover(ymd)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Global date-range selector: two in-place editable, masked date fields and a
 * calendar dropdown for picking a range in a single month view.
 */
export const DateRangeWidget = observer(function DateRangeWidget() {
  const { ping } = useStores();
  const [open, setOpen] = useState(false);
  const [fromText, setFromText] = useState(ping.fromDate);
  const [toText, setToText] = useState(ping.toDate);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the editable fields in sync when the range changes elsewhere.
  useEffect(() => setFromText(ping.fromDate), [ping.fromDate]);
  useEffect(() => setToText(ping.toDate), [ping.toDate]);

  // Close the calendar on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Commit the typed range if both dates are valid; otherwise revert.
  const commit = () => {
    if (isValidYmd(fromText) && isValidYmd(toText)) {
      const [a, b] = fromText <= toText ? [fromText, toText] : [toText, fromText];
      if (a !== ping.fromDate || b !== ping.toDate) ping.applyRange(a, b);
    } else {
      setFromText(ping.fromDate);
      setToText(ping.toDate);
    }
  };

  const handleSelect = (a: string, b: string) => {
    ping.applyRange(a, b);
    setOpen(false);
  };

  return (
    <div className="date-range" ref={ref}>
      <div className="date-range__label">Date Range</div>
      <div className="date-range__row">
        <input
          className="date-range__date"
          value={fromText}
          maxLength={10}
          placeholder="YYYY-MM-DD"
          aria-label="From date"
          onChange={(e) => setFromText(mask(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={commit}
        />
        <span className="date-range__sep">→</span>
        <input
          className="date-range__date"
          value={toText}
          maxLength={10}
          placeholder="YYYY-MM-DD"
          aria-label="To date"
          onChange={(e) => setToText(mask(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          onBlur={commit}
        />
        <button
          type="button"
          className={`date-range__cal-btn${open ? ' is-open' : ''}`}
          aria-label="Open calendar"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="16" y1="2" x2="16" y2="6" />
          </svg>
        </button>
      </div>

      {open && <RangeCalendar from={ping.fromDate} to={ping.toDate} onSelect={handleSelect} />}
    </div>
  );
});
