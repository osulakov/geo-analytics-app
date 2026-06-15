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
  defaultSettings: {
    detectEezCrossing: true,
    detectAoiCrossing: false,
    mmsis: [],
  },
  buildQuery(wkt, fromIso = null, toIso = null, settings) {
    const s = settings ?? geofenceEnterExit.defaultSettings;
    const params: unknown[] = [];
    // Push a value once and reuse its $-placeholder across the query.
    const ph = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    const pWkt = ph(wkt);
    const pFrom = ph(fromIso);
    const pTo = ph(toIso);
    const pMmsis = ph(s.mmsis.length > 0 ? s.mmsis : null);

    const parts: string[] = [];

    // EEZ crossings: read the precomputed geofence_enter_exit events.
    if (s.detectEezCrossing) {
      parts.push(`
        SELECT mmsi, subtype, ts, details,
               ST_X(position::geometry) AS lon,
               ST_Y(position::geometry) AS lat
          FROM events
         WHERE event_type = 'geofence_enter_exit'
           AND (${pWkt}::text IS NULL OR ST_Within(position::geometry, ST_GeomFromText(${pWkt}, 4326)))
           AND (${pFrom}::timestamptz IS NULL OR ts >= ${pFrom}::timestamptz)
           AND (${pTo}::timestamptz IS NULL OR ts <= ${pTo}::timestamptz)
           AND (${pMmsis}::text[] IS NULL OR mmsi = ANY(${pMmsis}::text[]))`);
    }

    // AOI boundary crossings: adjacent ais_ping segments crossing the AOI edge.
    if (s.detectAoiCrossing && wkt) {
      parts.push(`
        SELECT mmsi,
               'aoi_cross' AS subtype,
               ts + (ts2 - ts) / 2 AS ts,
               jsonb_build_object('aoi', true) AS details,
               ST_X(ST_LineInterpolatePoint(seg, 0.5)) AS lon,
               ST_Y(ST_LineInterpolatePoint(seg, 0.5)) AS lat
          FROM (
            SELECT mmsi, ts,
                   lead(ts) OVER w AS ts2,
                   ST_MakeLine(position::geometry, lead(position::geometry) OVER w) AS seg
              FROM ais_pings
             WHERE (${pFrom}::timestamptz IS NULL OR ts >= ${pFrom}::timestamptz)
               AND (${pTo}::timestamptz IS NULL OR ts <= ${pTo}::timestamptz)
               AND (${pMmsis}::text[] IS NULL OR mmsi = ANY(${pMmsis}::text[]))
            WINDOW w AS (PARTITION BY mmsi ORDER BY ts)
          ) pairs
         WHERE seg IS NOT NULL
           AND ST_NPoints(seg) = 2
           AND ST_Crosses(seg, ST_Boundary(ST_GeomFromText(${pWkt}, 4326)))`);
    }

    const sql =
      parts.length > 0
        ? `${parts.join('\nUNION ALL\n')}\nORDER BY ts`
        : `SELECT NULL::text AS mmsi, NULL::text AS subtype, NULL::timestamptz AS ts,
                  NULL::jsonb AS details, NULL::double precision AS lon,
                  NULL::double precision AS lat
             WHERE false`;
    return { sql, params };
  },
};
