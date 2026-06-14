import type { AnalysisConfig } from "./types";

/**
 * EEZ geofence enter/exit detection.
 *
 * Background: analyses_scripts/geofence_enter_exit.sh walks each vessel's
 * time-ordered ais_pings, takes adjacent pairs, and intersects the segment with
 * the EEZ boundary lines (src/assets/eez-simplified.geojson). Each crossing is
 * written to the `events` table as event_type='geofence_enter_exit' with
 * subtype 'enter'|'exit' and the crossing point as `position`.
 *
 * This analysis reads those crossings back, scoped to an AOI polygon (WKT) when
 * one is supplied, or globally when not. The query shape mirrors the /events
 * endpoint: it returns the vessel, direction, time, crossing location and the
 * dynamic details payload (the crossed EEZ name).
 */
export const geofenceEnterExit: AnalysisConfig = {
  id: "geofence-enter-exit",
  name: "EEZ Geofence Crossings (Enter / Exit)",
  description:
    "Vessels crossing EEZ boundaries within the selected AOI, or globally when no AOI is set.",
  eventType: "geofence_enter_exit",
  // Crossings are drawn as red square icons; the device tracks that produced
  // them are shown as yellow triangles, fetched for the selected AOIs only.
  layers_config: [
    {
      id: "geofence",
      name: "Geofence (Enter/Exit)",
      type: "ICON",
      icon: "square",
      color: "#ef4444",
    },
    {
      id: "device-tracks",
      name: "Device tracks",
      type: "ICON",
      icon: "triangle",
      color: "#facc15",
      config: { aoi_bounded: true, can_get_full_path: true },
    },
  ],
  buildQuery(wkt, fromIso = null, toIso = null) {
    // $1 = AOI WKT (WGS84) or NULL (global); $2/$3 = date range or NULL.
    const sql = `
      SELECT mmsi,
             subtype,
             ts,
             details,
             ST_X(position::geometry) AS lon,
             ST_Y(position::geometry) AS lat
        FROM events
       WHERE event_type = 'geofence_enter_exit'
         AND (
           $1::text IS NULL
           OR ST_Within(position::geometry, ST_GeomFromText($1, 4326))
         )
         AND ($2::timestamptz IS NULL OR ts >= $2::timestamptz)
         AND ($3::timestamptz IS NULL OR ts <= $3::timestamptz)
       ORDER BY ts`;
    return { sql, params: [wkt, fromIso, toIso] };
  },
};
