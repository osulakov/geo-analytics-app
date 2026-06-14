/** A parameterized SQL query ready to be sent to the database. */
export interface AnalysisQuery {
  sql: string;
  params: unknown[];
}

/** How a layer is drawn on the map / shown in the legend. */
export type LayerKind = 'ICON';
/** Icon shape for `type: 'ICON'` layers. */
export type LayerIconShape = 'square' | 'triangle';

/** Optional behavioral config for a layer. */
export interface LayerOptions {
  /**
   * When true, the layer's data is fetched for the selected AOIs only (rather
   * than globally / by viewport). E.g. device tracks bounded to the AOIs.
   */
  aoi_bounded?: boolean;
}

/**
 * A map layer contributed by an analysis. The Layers widget is built entirely
 * from these (one toggle row per layer); the map renderer reads each layer's
 * visibility from the LayerStore keyed by `id`.
 */
export interface LayerConfig {
  /** Unique layer id; also the visibility key in the LayerStore. */
  id: string;
  /** Label shown in the Layers widget. */
  name: string;
  /** Render kind of the layer's marker / legend swatch. */
  type: LayerKind;
  /** Icon shape (for `type: 'ICON'`). */
  icon: LayerIconShape;
  /** Icon / marker color (matches what the map draws). */
  color: string;
  /** Optional behavioral config (e.g. AOI-bounded data fetching). */
  config?: LayerOptions;
}

/**
 * Declarative definition of an analysis. Each analysis is essentially a DB
 * query that can be scoped to an AOI polygon (WKT, WGS84) supplied at run time,
 * or run globally when no WKT is provided.
 */
export interface AnalysisConfig {
  id: string;
  /** Human-readable name shown in the Analyses widget. */
  name: string;
  description: string;
  /** The event type this analysis concerns (matches the `events` table). */
  eventType: string;
  /** Map layers this analysis contributes (drives the Layers widget). */
  layers_config: LayerConfig[];
  /**
   * Build the DB query.
   * @param wkt    AOI polygon/multipolygon (WGS84) to scope to, or null for global.
   * @param fromIso Inclusive start of the date range, or null for unbounded.
   * @param toIso   Inclusive end of the date range, or null for unbounded.
   */
  buildQuery(wkt: string | null, fromIso?: string | null, toIso?: string | null): AnalysisQuery;
}
