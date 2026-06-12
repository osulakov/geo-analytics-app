import type { Satellite } from '../data_loaders/satellites';

interface SatelliteTooltipProps {
  satellite: Satellite;
  /** Footprint area in km² when hovering the coverage strip; null for the ping. */
  area: number | null;
  x: number;
  y: number;
}

function fmt(value: number | null, unit: string): string {
  return value == null ? '—' : `${value} ${unit}`;
}

/** Tooltip showing a satellite's orbital data (and coverage area when hovering
 *  its capture strip). */
export function SatelliteTooltip({ satellite, area, x, y }: SatelliteTooltipProps) {
  return (
    <div className="satellite-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="satellite-tooltip__title">{satellite.name}</div>
      <dl className="satellite-tooltip__list">
        <div>
          <dt>Constellation</dt>
          <dd>{satellite.constellation}</dd>
        </div>
        {area != null && (
          <div>
            <dt>Coverage area</dt>
            <dd>{Math.round(area).toLocaleString()} km²</dd>
          </div>
        )}
        <div>
          <dt>Altitude</dt>
          <dd>{fmt(satellite.altitudeKm, 'km')}</dd>
        </div>
        <div>
          <dt>Inclination</dt>
          <dd>{fmt(satellite.inclinationDeg, '°')}</dd>
        </div>
        <div>
          <dt>Orbital period</dt>
          <dd>{fmt(satellite.orbitalPeriodMin, 'min')}</dd>
        </div>
        <div>
          <dt>Swath width</dt>
          <dd>{fmt(satellite.swathWidthKm, 'km')}</dd>
        </div>
        <div>
          <dt>Ground velocity</dt>
          <dd>{fmt(satellite.groundVelocityKmSec, 'km/s')}</dd>
        </div>
        <div>
          <dt>Look angle</dt>
          <dd>{fmt(satellite.lookAngleDeg, '°')}</dd>
        </div>
        <div>
          <dt>RAAN</dt>
          <dd>{fmt(satellite.raanDeg, '°')}</dd>
        </div>
        <div>
          <dt>Mean anomaly</dt>
          <dd>{fmt(satellite.meanAnomalyDeg, '°')}</dd>
        </div>
      </dl>
    </div>
  );
}
