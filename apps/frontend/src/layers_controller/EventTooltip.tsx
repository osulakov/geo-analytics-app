import { useEffect, useState } from "react";

import type { MapEvent } from "../data_loaders/events";
import { fetchVesselByMmsi, type StaticVesselInfo } from "../data_loaders/vessels";

interface EventTooltipProps {
  event: MapEvent;
  x: number;
  y: number;
}

/** Humanize a snake/kebab event type, e.g. "geofence_enter_exit" → "Geofence Enter Exit". */
function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format an ISO timestamp as `YYYY-MM-DD HH:MM` (UTC). */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** Tooltip for a map event. Title is the humanized event type; the body shows
 *  event-type-specific fields, the vessel's static info, and the event time. */
export function EventTooltip({ event, x, y }: EventTooltipProps) {
  const [vessel, setVessel] = useState<StaticVesselInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetchVesselByMmsi(event.mmsi)
      .then((data) => {
        if (active) setVessel(data);
      })
      .catch((error) =>
        console.error(`Failed to fetch vessel ${event.mmsi}:`, error),
      );
    return () => {
      active = false;
    };
  }, [event.mmsi]);

  const eez =
    event.details && typeof event.details.eez === "string"
      ? event.details.eez
      : null;

  return (
    <div className="event-tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="event-tooltip__title">{humanize(event.eventType)}</div>
      <dl className="event-tooltip__list">
        {/* Geofence-specific: which EEZ the vessel is crossing. */}
        {event.eventType === "geofence_enter_exit" && (
          <>
            <div>
              <dt>Direction</dt>
              <dd>{event.subtype ? humanize(event.subtype) : "—"}</dd>
            </div>
            <div>
              <dt>EEZ</dt>
              <dd>{eez ?? "—"}</dd>
            </div>
          </>
        )}

        <div>
          <dt>Vessel</dt>
          <dd>{vessel ? vessel.vesselName : event.mmsi}</dd>
        </div>
        <div>
          <dt>MMSI</dt>
          <dd>{event.mmsi}</dd>
        </div>
        <div>
          <dt>Flag</dt>
          <dd>{vessel?.flagState ?? "—"}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{vessel?.vesselType ?? "—"}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatTimestamp(event.ts)}</dd>
        </div>
      </dl>
    </div>
  );
}
