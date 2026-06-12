interface EezTooltipProps {
  name: string;
  x: number;
  y: number;
}

/** Tooltip for a hovered EEZ (coverage area) boundary — shows its name. */
export function EezTooltip({ name, x, y }: EezTooltipProps) {
  return (
    <div className="eez-tooltip" style={{ left: x + 14, top: y + 14 }}>
      {name}
    </div>
  );
}
