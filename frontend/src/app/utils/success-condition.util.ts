import { FlowStepDefinition, createStepId } from './flow-templates';

export type SuccessConditionType =
  | 'page-contains-text'
  | 'url-changed'
  | 'network-2xx-after-submit'
  | 'element-visible';

export type SuccessConfidenceLevel = 'high' | 'medium' | 'low';

export interface SuccessConditionSuggestion {
  id: string;
  type: SuccessConditionType;
  value?: string;
  elementLabel?: string;
  confidence: SuccessConfidenceLevel;
  reason: string;
  plainLanguage: string;
  developerDetails?: Record<string, unknown>;
}

export interface DryRunAnalysisResult {
  status: 'ok' | 'partial' | 'failed';
  error?: string | null;
  triggerStepIndex?: number;
  triggerStepLabel?: string;
  beforeScreenshotPath?: string | null;
  afterScreenshotPath?: string | null;
  beforeState?: { url: string; title: string };
  afterState?: { url: string; title: string };
  suggestions: SuccessConditionSuggestion[];
  executedSteps: Array<{
    label: string;
    action: string;
    status: string;
    message: string;
  }>;
}

export interface DryRunAnalyzeRequest {
  startUrl: string;
  steps: Record<string, unknown>[];
  viewport?: { width: number; height: number };
}

export const ASSERTION_ACTIONS = new Set([
  'waitForText',
  'expectUrlContains',
  'expectVisible',
  'expectNetworkSuccess',
]);

export function splitFlowSteps(steps: FlowStepDefinition[]): {
  actionSteps: FlowStepDefinition[];
  assertionSteps: FlowStepDefinition[];
  screenshotSteps: FlowStepDefinition[];
} {
  const actionSteps: FlowStepDefinition[] = [];
  const assertionSteps: FlowStepDefinition[] = [];
  const screenshotSteps: FlowStepDefinition[] = [];

  for (const step of steps) {
    if (step.action === 'screenshot') {
      screenshotSteps.push(step);
    } else if (ASSERTION_ACTIONS.has(step.action)) {
      assertionSteps.push(step);
    } else {
      actionSteps.push(step);
    }
  }

  return { actionSteps, assertionSteps, screenshotSteps };
}

export function successSuggestionToFlowStep(
  suggestion: SuccessConditionSuggestion
): FlowStepDefinition {
  switch (suggestion.type) {
    case 'page-contains-text':
      return {
        id: createStepId(),
        action: 'waitForText',
        label: 'Check success message',
        text: suggestion.value || 'thank',
        timeoutMs: 8000,
      };
    case 'url-changed':
      return {
        id: createStepId(),
        action: 'expectUrlContains',
        label: 'Check URL changed',
        value: suggestion.value || '/',
      };
    case 'network-2xx-after-submit':
      return {
        id: createStepId(),
        action: 'expectNetworkSuccess',
        label: 'Check successful server response',
        value: suggestion.value || undefined,
        timeoutMs: 8000,
      };
    case 'element-visible':
      return {
        id: createStepId(),
        action: 'expectVisible',
        label: `Check ${suggestion.elementLabel || 'element'} is visible`,
        selector: suggestion.value || '',
        elementLabel: suggestion.elementLabel,
        targetLabel: suggestion.elementLabel,
      };
    default:
      return {
        id: createStepId(),
        action: 'waitForText',
        label: 'Check success',
        text: suggestion.value || 'success',
        timeoutMs: 8000,
      };
  }
}

export function applySelectedSuccessConditions(
  actionSteps: FlowStepDefinition[],
  selected: SuccessConditionSuggestion[],
  screenshotSteps: FlowStepDefinition[] = []
): FlowStepDefinition[] {
  const assertions = selected.map(successSuggestionToFlowStep);
  const screenshots =
    screenshotSteps.length > 0
      ? screenshotSteps
      : [{ id: createStepId(), action: 'screenshot' as const, label: 'Capture final screenshot' }];
  return [...actionSteps, ...assertions, ...screenshots];
}

export function suggestionSelectionKey(suggestion: SuccessConditionSuggestion): string {
  return suggestion.id || `${suggestion.type}|${suggestion.value || ''}|${suggestion.elementLabel || ''}`;
}

export function confidenceBadgeClass(level: SuccessConfidenceLevel): string {
  if (level === 'high') return 'confidence-high';
  if (level === 'medium') return 'confidence-medium';
  return 'confidence-low';
}
