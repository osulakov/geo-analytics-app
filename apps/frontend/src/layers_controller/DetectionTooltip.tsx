interface DetectionTooltipProps {
  metadata: Record<string, unknown> | null;
  timestamp: string | null;
  x: number;
  y: number;
}

/** Humanize a camelCase / snake_case key, e.g. "shipType" → "Ship type". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Format a metadata value for display. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') {
    // Show confidences/fractions with 2 decimals, integers as-is.
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

/** Tooltip for a hovered detected object — shows every metadata field + time. */
export function DetectionTooltip({ metadata, timestamp, x, y }: DetectionTooltipProps) {
  const entries = Object.entries(metadata ?? {});
  const label = (metadata?.label as string | undefined) ?? 'Detection';

  return (
    <div className="event-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="event-tooltip__title">{label}</div>
      <dl className="event-tooltip__list">
        {entries
          .filter(([key]) => key !== 'label')
          .map(([key, value]) => (
            <div key={key}>
              <dt>{humanizeKey(key)}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
        <div>
          <dt>Time</dt>
          <dd>{formatTimestamp(timestamp)}</dd>
        </div>
      </dl>
    </div>
  );
}
