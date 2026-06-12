import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../stores/StoreContext';

/**
 * Global date-range selector. Opens a dropdown with From/To pickers; the range
 * is applied (and the map reloaded) only when Apply is pressed.
 */
export const DateRangeWidget = observer(function DateRangeWidget() {
  const { ping, event } = useStores();
  const [open, setOpen] = useState(false);
  const [fromDraft, setFromDraft] = useState(ping.fromDate);
  const [toDraft, setToDraft] = useState(ping.toDate);
  const ref = useRef<HTMLDivElement>(null);

  // Seed the drafts from the applied range whenever the dropdown opens.
  useEffect(() => {
    if (open) {
      setFromDraft(ping.fromDate);
      setToDraft(ping.toDate);
    }
  }, [open, ping.fromDate, ping.toDate]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const apply = () => {
    ping.applyRange(fromDraft, toDraft);
    void event.loadGeofence(ping.rangeStartIso, ping.rangeEndIso, ping.viewport);
    setOpen(false);
  };

  return (
    <div className="date-range" ref={ref}>
      <button
        type="button"
        className="date-range__trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="date-range__value">
          {ping.fromDate} → {ping.toDate}
        </span>
        <svg
          className={`date-range__chevron${open ? ' is-open' : ''}`}
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

      {open && (
        <div className="date-range__dropdown">
          <label className="date-range__field">
            <span>From</span>
            <input
              type="date"
              value={fromDraft}
              max={toDraft}
              onChange={(event) => setFromDraft(event.target.value)}
            />
          </label>
          <label className="date-range__field">
            <span>To</span>
            <input
              type="date"
              value={toDraft}
              min={fromDraft}
              onChange={(event) => setToDraft(event.target.value)}
            />
          </label>
          <button type="button" className="date-range__apply" onClick={apply}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
});
