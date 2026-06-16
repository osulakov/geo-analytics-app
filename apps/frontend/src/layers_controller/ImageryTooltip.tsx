interface ImageryTooltipProps {
  name: string;
  timestamp: string | null;
  x: number;
  y: number;
}

/** Format an ISO timestamp as `YYYY-MM-DD HH:MM` (UTC). */
function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** Tooltip for a hovered imagery footprint — shows satellite name + timestamp. */
export function ImageryTooltip({ name, timestamp, x, y }: ImageryTooltipProps) {
  return (
    <div className="imagery-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="imagery-tooltip__title">{name}</div>
      <div className="imagery-tooltip__time">{formatTimestamp(timestamp)}</div>
    </div>
  );
}
