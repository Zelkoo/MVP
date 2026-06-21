import {
  DetectedElementRef,
  FlowAnalysisResult,
  FlowSuggestion,
  GeneratedStep,
  SuccessStrategy,
} from '../models/flow-suggestion.model';
import { InspectedElement, PageInspectionResult } from '../models/page-inspector.model';
import { elementToStepFields } from './flow-wizard';
import {
  convertSuggestionToFlowSteps,
  describeSuccessStrategy,
  getSuccessStrategies,
} from './suggestion-to-flow';
import { FlowStepDefinition } from './flow-templates';

export interface WizardConfirmSlot {
  id: string;
  stepType: 'fill-input' | 'click-element';
  label: string;
  roleLabel: string;
  detectedSelector: string;
  element?: InspectedElement;
  replacing: boolean;
}

export function analysisToInspection(analysis: FlowAnalysisResult): PageInspectionResult {
  return {
    url: analysis.url,
    finalUrl: analysis.finalUrl,
    title: analysis.title,
    screenshotPath: analysis.screenshotPath,
    viewport: analysis.viewport,
    elements: analysis.elements,
    status: analysis.status,
    warnings: analysis.warnings,
    timing: analysis.timing,
  };
}

export function matchDetectedToInspected(
  detected: DetectedElementRef,
  elements: InspectedElement[]
): InspectedElement | undefined {
  const candidates = [detected.selector, ...detected.alternatives].filter(Boolean);
  return elements.find(
    (element) =>
      candidates.includes(element.selector) ||
      element.selectorAlternatives.some((alt) => candidates.includes(alt))
  );
}

export function buildConfirmSlots(
  suggestion: FlowSuggestion,
  elements: InspectedElement[]
): WizardConfirmSlot[] {
  return suggestion.generatedSteps
    .filter((step) => step.type === 'fill-input' || step.type === 'click-element')
    .map((step, index) => {
      const detected =
        suggestion.detectedElements.find((entry) => entry.selector === step.selector) ||
        ({
          role: step.elementLabel || step.label,
          label: step.elementLabel || step.label,
          selector: step.selector || '',
          alternatives: [],
        } as DetectedElementRef);

      return {
        id: `slot-${index}-${step.selector || step.label}`,
        stepType: step.type as 'fill-input' | 'click-element',
        label: step.label,
        roleLabel: step.elementLabel || step.label,
        detectedSelector: step.selector || '',
        element: matchDetectedToInspected(detected, elements),
        replacing: false,
      };
    });
}

export function allConfirmSlotsResolved(slots: WizardConfirmSlot[]): boolean {
  return slots.every((slot) => Boolean(slot.element));
}

export function confirmSlotElementIds(slots: WizardConfirmSlot[]): string[] {
  return slots.map((slot) => slot.element?.id).filter((id): id is string => Boolean(id));
}

export function confidenceHint(label: string): string {
  switch (label) {
    case 'High':
      return 'Ready to test — we found strong matches on this page.';
    case 'Medium':
      return 'Please confirm the highlighted elements look correct.';
    default:
      return 'Manual review recommended — detection confidence is low.';
  }
}

export function patchSuggestionSteps(
  suggestion: FlowSuggestion,
  confirmSlots: WizardConfirmSlot[]
): GeneratedStep[] {
  return suggestion.generatedSteps.map((step) => {
    if (step.type !== 'fill-input' && step.type !== 'click-element') {
      return step;
    }

    const slot = confirmSlots.find(
      (entry) =>
        entry.detectedSelector === step.selector ||
        entry.label === step.label ||
        entry.roleLabel === step.elementLabel
    );

    if (!slot?.element) return step;

    const actionType = step.type === 'fill-input' ? 'fill' : 'click';
    const fields = elementToStepFields(slot.element, actionType);

    return {
      ...step,
      selector: fields.selector || step.selector,
      text: fields.text || step.text,
      elementLabel: fields.elementLabel || step.elementLabel,
      value: step.type === 'fill-input' ? step.value || fields.value : step.value,
    };
  });
}

export function buildWizardFlowSteps(
  suggestion: FlowSuggestion,
  startUrl: string,
  confirmSlots: WizardConfirmSlot[],
  successStrategy: SuccessStrategy
): FlowStepDefinition[] {
  const patchedSuggestion: FlowSuggestion = {
    ...suggestion,
    generatedSteps: patchSuggestionSteps(suggestion, confirmSlots),
  };
  return convertSuggestionToFlowSteps(patchedSuggestion, startUrl, successStrategy);
}

export function defaultSuccessStrategy(suggestion: FlowSuggestion): SuccessStrategy | null {
  const strategies = getSuccessStrategies(suggestion.generatedSteps);
  return strategies[0] || null;
}

export function successStrategyTitle(strategy: SuccessStrategy): string {
  switch (strategy.type) {
    case 'page-contains-text':
      return 'Page shows a success message';
    case 'url-changed':
      return 'The page URL changes';
    case 'network-2xx-after-submit':
      return 'The server responds successfully';
    case 'element-visible':
      return 'Something new appears on the page';
    default:
      return 'The action succeeds';
  }
}

export function successStrategyPlainDescription(strategy: SuccessStrategy): string {
  return describeSuccessStrategy(strategy);
}
