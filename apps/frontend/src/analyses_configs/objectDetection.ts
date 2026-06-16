import type { AnalysisConfig } from "./types";

/**
 * Object detection from imagery (OpenAI vision).
 *
 * Unlike the SQL analyses, this one does not build a DB query. When run, the
 * frontend creates a DB job (to get an id), then asks the backend
 * (`POST /jobs/:id/object-detection`) to: find stored imagery within the job's
 * AOI + date range, send each image to OpenAI with a prompt describing the
 * imagery metadata and asking for object polygons, geo-locate the detections
 * into each image's footprint, and persist them to `detected_objects`.
 *
 * `should_run_on_invoke` is false: opening a saved job loads the persisted
 * detections rather than calling OpenAI again (re-run is explicit).
 */
export const objectDetection: AnalysisConfig = {
  id: "object-detection",
  name: "Object Detections",
  description:
    "Detects objects in stored imagery within the selected AOI and date range using OpenAI vision, returning geo-located polygons.",
  eventType: "object_detection",
  should_run_on_invoke: false,
  layers_config: [
    {
      id: "object-detections",
      name: "Object detections",
      type: "ICON",
      icon: "square",
      color: "#22d3ee",
    },
  ],
  supported_widgets: ["layers", "timeslider"],
  defaultSettings: {
    detectEezCrossing: false,
    detectAoiCrossing: false,
    mmsis: [],
  },
  // Object detection runs via the backend, not a DB query. Return an empty
  // result so the generic SQL run path is a harmless no-op if ever invoked.
  buildQuery() {
    return {
      sql: `SELECT NULL::text AS mmsi, NULL::text AS subtype, NULL::timestamptz AS ts,
                   NULL::jsonb AS details, NULL::double precision AS lon,
                   NULL::double precision AS lat
              WHERE false`,
      params: [],
    };
  },
};
