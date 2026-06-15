import { geofenceEnterExit } from './geofenceEnterExit';
import type { AnalysisConfig } from './types';

export type {
  AnalysisConfig,
  AnalysisQuery,
  AnalysisSettings,
  LayerConfig,
  SupportedWidget,
} from './types';

/** All available analyses, shown in the Analyses widget. */
export const ANALYSES: AnalysisConfig[] = [geofenceEnterExit];
