import { InspectedElement, InspectionStatus, InspectionTiming, InspectionWarning } from './page-inspector.model';



export interface DetectedElementRef {

  role: string;

  ariaRole?: string;

  label: string;

  selector: string;

  alternatives: string[];

}



export type SuggestionType =

  | 'contact-form'

  | 'newsletter'

  | 'cta'

  | 'add-to-cart'

  | 'checkout-start'

  | 'mobile-menu'

  | 'broken-links';



export type ConfidenceLevel = 'high' | 'medium' | 'low';



export type GeneratedStepType =

  | 'go-to-url'

  | 'fill-input'

  | 'click-element'

  | 'expect-success'

  | 'check-links';



export type SuccessStrategyType =

  | 'page-contains-text'

  | 'url-changed'

  | 'network-2xx-after-submit'

  | 'element-visible'

  | 'no-broken-links';



export interface SuccessStrategy {

  type: SuccessStrategyType;

  value?: string;

  elementLabel?: string;

}



export interface SuccessCondition {

  type: SuccessStrategyType | string;

  label: string;

  description: string;

  value?: string;

  elementLabel?: string;

  primary?: boolean;

}



export interface GeneratedStep {

  type: GeneratedStepType;

  label: string;

  url?: string;

  selector?: string;

  text?: string;

  value?: string;

  elementLabel?: string;

  linkCount?: number;

  successStrategies?: SuccessStrategy[];

}



export interface FlowSuggestion {

  id: string;

  type: SuggestionType;

  title: string;

  description: string;

  confidence: number;

  confidenceLabel: string;

  confidenceLevel: ConfidenceLevel;

  businessValue: string;

  suggestedReasons: string[];

  estimatedReliability: string;

  successConditions: SuccessCondition[];

  detectedElements: DetectedElementRef[];

  generatedSteps: GeneratedStep[];

  viewport?: 'desktop' | 'mobile';

  scenarioType?: 'flow' | 'broken-links';

}



export interface FlowAnalysisResult {

  url: string;

  finalUrl: string;

  title: string;

  screenshotPath: string | null;

  viewport: { width: number; height: number };

  elements: InspectedElement[];

  suggestions: FlowSuggestion[];

  warnings: InspectionWarning[];

  status: InspectionStatus;

  timing?: InspectionTiming;

}



export interface AnalyzeFlowRequest {

  url: string;

  viewport?: 'desktop' | 'mobile';

}



export interface SuggestionRunState {

  running: boolean;

  run: import('./scenario.model').ScenarioRun | null;

  scenarioId?: number;

}


