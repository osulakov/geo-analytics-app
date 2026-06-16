interface ImageryTooltipProps {
  name: string;
  timestamp: string | null;
  x: number;
  y: number;
}

/** Format an ISO timestamp as a readable local date-time. */
function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
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
