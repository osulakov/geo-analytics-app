interface AoiTooltipProps {
  name: string;
  areaKm2: number;
  x: number;
  y: number;
}

const areaFmt = new Intl.NumberFormat();

/** Tooltip for a hovered AOI — shows its name and area. */
export function AoiTooltip({ name, areaKm2, x, y }: AoiTooltipProps) {
  return (
    <div className="aoi-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="aoi-tooltip__title">{name}</div>
      <div className="aoi-tooltip__area">{areaFmt.format(Math.round(areaKm2))} km²</div>
    </div>
  );
}
