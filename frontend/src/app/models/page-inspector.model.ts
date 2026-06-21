export type InspectorViewport = 'desktop' | 'mobile';

export type InspectionStatus = 'ok' | 'partial' | 'blocked' | 'timeout' | 'error';

export type InspectionWarningType =
  | 'bot-protection'
  | 'timeout'
  | 'low-content'
  | 'navigation-error'
  | 'info';

export interface InspectionWarning {
  type: InspectionWarningType | string;
  message: string;
}

export interface InspectionTiming {
  navigationStartedAt: string;
  domContentLoadedAt: string | null;
  screenshotTakenAt: string | null;
  loadDurationMs: number;
  challengeDetected: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ElementCategory =
  | 'primary-cta'
  | 'secondary-cta'
  | 'submit-button'
  | 'form-input'
  | 'email-input'
  | 'name-input'
  | 'message-input'
  | 'navigation-link'
  | 'mobile-menu-button'
  | 'add-to-cart'
  | 'checkout'
  | 'newsletter'
  | 'unknown';

export type ElementImportance = 'high' | 'medium' | 'low';

export interface InspectedElement {
  id: string;
  tagName: string;
  text: string;
  role: string | null;
  type: string | null;
  selector: string;
  selectorAlternatives: string[];
  actionTypeSuggestions: string[];
  isVisible: boolean;
  boundingBox: BoundingBox;
  confidence: number;
  label: string;
  category?: ElementCategory;
  importance?: ElementImportance;
  humanLabel?: string;
  businessMeaning?: string;
  suggestedActions?: string[];
  explanation?: string;
}

export interface PageInspectionResult {
  url: string;
  finalUrl: string;
  title: string;
  screenshotPath: string | null;
  viewport: { width: number; height: number };
  elements: InspectedElement[];
  status: InspectionStatus;
  warnings: InspectionWarning[];
  timing?: InspectionTiming;
}

export interface InspectPageRequest {
  url: string;
  viewport?: InspectorViewport;
}

export type PreviewLoadPhase =
  | 'idle'
  | 'loading'
  | 'waiting'
  | 'detecting'
  | 'ready'
  | 'blocked'
  | 'partial'
  | 'timeout'
  | 'error';

export function isPreviewUsable(result: PageInspectionResult | null): boolean {
  if (!result) return false;
  if (result.status === 'blocked' || result.status === 'error' || result.status === 'timeout') {
    return false;
  }
  return result.elements.length >= 3;
}

export function previewStatusLabel(result: PageInspectionResult | null, loading: boolean): string {
  if (loading) return 'Loading page…';
  if (!result) return 'Waiting for URL';
  switch (result.status) {
    case 'ok':
      return 'Preview ready';
    case 'partial':
      return 'Preview partial';
    case 'blocked':
      return 'Preview blocked';
    case 'timeout':
      return 'Preview timed out';
    case 'error':
      return 'Preview failed';
    default:
      return 'Preview status unknown';
  }
}
