import {
  DetectedElementRef,
  FlowSuggestion,
  GeneratedStep,
  SuccessStrategy,
  SuccessStrategyType,
} from '../models/flow-suggestion.model';
import { FlowStepDefinition, createStepId } from './flow-templates';

export const SUCCESS_STRATEGY_LABELS: Record<SuccessStrategyType, string> = {
  'page-contains-text': 'Page shows success text',
  'url-changed': 'URL changed',
  'network-2xx-after-submit': 'Server returned a successful response (2xx)',
  'element-visible': 'Something new appears on the page',
  'no-broken-links': 'No broken links found',
};

export function describeSuccessStrategy(strategy: SuccessStrategy): string {
  switch (strategy.type) {
    case 'page-contains-text':
      return `Check that the page shows text like "${strategy.value || 'thank you'}"`;
    case 'url-changed':
      return `Check that the URL contains "${strategy.value || 'success'}"`;
    case 'network-2xx-after-submit':
      return strategy.value
        ? `Check that a request containing "${strategy.value}" returns 2xx`
        : 'Check that a form or API request returns 2xx';
    case 'element-visible':
      return `Check that ${strategy.elementLabel || 'the expected element'} is visible`;
    case 'no-broken-links':
      return 'Check that important links load without errors';
    default:
      return 'Verify the action succeeded';
  }
}

export function plainGeneratedStepSummary(step: GeneratedStep, startUrl = ''): string {
  switch (step.type) {
    case 'go-to-url':
      return `Open page`;
    case 'fill-input':
      return `Fill ${step.elementLabel || 'input'}`;
    case 'click-element':
      return `Click ${step.elementLabel || step.text || 'button'}`;
    case 'check-links':
      return `Check up to ${step.linkCount || 'important'} links for dead ends`;
    case 'expect-success':
      return 'Check success';
    default:
      return step.label;
  }
}

export function getSuccessStrategies(steps: GeneratedStep[]): SuccessStrategy[] {
  const expectStep = steps.find((step) => step.type === 'expect-success');
  return expectStep?.successStrategies || [];
}

export function suggestionFlowName(suggestion: FlowSuggestion): string {
  return suggestion.title.replace(/\s+test$/i, '').trim() + ' test';
}

function findDetectedElement(
  suggestion: FlowSuggestion,
  step: GeneratedStep
): DetectedElementRef | undefined {
  if (step.selector) {
    const bySelector = suggestion.detectedElements.find(
      (entry) =>
        entry.selector === step.selector ||
        entry.alternatives.includes(step.selector!) ||
        step.selector === entry.alternatives[0]
    );
    if (bySelector) return bySelector;
  }

  if (step.elementLabel) {
    return suggestion.detectedElements.find((entry) => entry.label === step.elementLabel);
  }

  return undefined;
}

function targetMetadata(
  suggestion: FlowSuggestion,
  step: GeneratedStep
): Pick<
  FlowStepDefinition,
  'selector' | 'selectorAlternatives' | 'targetText' | 'targetRole' | 'targetLabel' | 'text'
> {
  const detected = findDetectedElement(suggestion, step);
  const primarySelector =
    step.selector && !step.selector.startsWith('text=')
      ? step.selector
      : detected?.selector || step.selector;

  const alternatives = (detected?.alternatives || []).filter(
    (candidate) => candidate && candidate !== primarySelector
  );

  const text =
    step.text ||
    (step.selector?.startsWith('text=') ? step.selector.replace(/^text=/, '') : undefined);

  return {
    selector: primarySelector,
    selectorAlternatives: alternatives.length ? alternatives : undefined,
    targetText: text,
    targetRole: detected?.ariaRole || undefined,
    targetLabel: step.elementLabel || detected?.label,
    text,
  };
}

export function convertSuggestionToFlowSteps(
  suggestion: FlowSuggestion,
  startUrl: string,
  successStrategy?: SuccessStrategy
): FlowStepDefinition[] {
  const steps: FlowStepDefinition[] = [];

  for (const step of suggestion.generatedSteps) {
    if (step.type === 'expect-success') {
      const strategy = successStrategy || step.successStrategies?.[0];
      if (!strategy) continue;
      steps.push(...convertSuccessStrategy(suggestion, strategy));
      continue;
    }

    steps.push(convertGeneratedStep(suggestion, step, startUrl));
  }

  steps.push({
    id: createStepId(),
    action: 'screenshot',
    label: 'Capture final screenshot',
  });

  return steps;
}

function convertGeneratedStep(
  suggestion: FlowSuggestion,
  step: GeneratedStep,
  startUrl: string
): FlowStepDefinition {
  const base = {
    id: createStepId(),
    label: step.label,
    elementLabel: step.elementLabel,
  };

  switch (step.type) {
    case 'go-to-url':
      return { ...base, action: 'goto', url: step.url || startUrl };
    case 'fill-input':
      return {
        ...base,
        action: 'fill',
        value: step.value || '',
        ...targetMetadata(suggestion, step),
      };
    case 'click-element':
      return {
        ...base,
        action: 'click',
        ...targetMetadata(suggestion, step),
      };
    default:
      return { ...base, action: 'goto', url: startUrl };
  }
}

function convertSuccessStrategy(
  suggestion: FlowSuggestion,
  strategy: SuccessStrategy
): FlowStepDefinition[] {
  switch (strategy.type) {
    case 'page-contains-text':
      return [
        {
          id: createStepId(),
          action: 'waitForText',
          label: 'Check success message',
          text: strategy.value || 'thank',
          timeoutMs: 8000,
        },
      ];
    case 'url-changed':
      return [
        {
          id: createStepId(),
          action: 'expectUrlContains',
          label: 'Check URL changed',
          value: strategy.value || '/',
        },
      ];
    case 'network-2xx-after-submit':
      return [
        {
          id: createStepId(),
          action: 'expectNetworkSuccess',
          label: 'Check successful server response',
          value: strategy.value || undefined,
          timeoutMs: 8000,
        },
      ];
    case 'element-visible': {
      const detected = suggestion.detectedElements.find(
        (entry) =>
          entry.selector === strategy.value ||
          entry.label === strategy.elementLabel ||
          entry.alternatives.includes(strategy.value || '')
      );
      return [
        {
          id: createStepId(),
          action: 'expectVisible',
          label: `Check ${strategy.elementLabel || 'element'} is visible`,
          selector: strategy.value || detected?.selector || '',
          elementLabel: strategy.elementLabel || detected?.label,
          selectorAlternatives: detected?.alternatives?.filter((alt) => alt !== strategy.value),
          targetRole: detected?.ariaRole,
          targetLabel: strategy.elementLabel || detected?.label,
          targetText: detected?.label,
        },
      ];
    }
    default:
      return [];
  }
}

export function confidenceBadgeClass(label: string, level?: string): string {
  const normalized = (level || label).toLowerCase();
  if (normalized === 'high') return 'confidence-high';
  if (normalized === 'medium') return 'confidence-medium';
  return 'confidence-low';
}

export function confidenceHint(label: string, level?: string): string {
  const normalized = (level || label).toLowerCase();
  switch (normalized) {
    case 'high':
      return 'Ready to test — strong matches found.';
    case 'medium':
      return 'Worth a quick look, then run the test.';
    default:
      return 'Run once to validate — manual review recommended.';
  }
}

export function reliabilityLabel(reliability: string): string {
  return reliability;
}

export function usesBrokenLinksScenario(suggestion: FlowSuggestion): boolean {
  return suggestion.type === 'broken-links' || suggestion.scenarioType === 'broken-links';
}

export function suggestionTypeLabel(type: string): string {
  switch (type) {
    case 'contact-form':
      return 'Contact form';
    case 'newsletter':
      return 'Newsletter signup';
    case 'cta':
      return 'CTA click';
    case 'add-to-cart':
      return 'Add to cart';
    case 'checkout-start':
      return 'Checkout';
    case 'mobile-menu':
      return 'Mobile menu';
    case 'broken-links':
      return 'Broken links';
    default:
      return 'Flow test';
  }
}
