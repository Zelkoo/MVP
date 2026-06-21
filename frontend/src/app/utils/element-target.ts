import { InspectedElement } from '../models/page-inspector.model';
import { FlowStepDefinition } from './flow-templates';

export type ElementTargetFields = Pick<
  FlowStepDefinition,
  'selector' | 'selectorAlternatives' | 'targetText' | 'targetRole' | 'targetLabel' | 'text' | 'elementLabel'
>;

export function buildElementTargetFields(element: InspectedElement): ElementTargetFields {
  const cssSelector =
    element.selectorAlternatives.find((candidate) => !candidate.startsWith('text=')) || element.selector;

  const primarySelector = element.selector.startsWith('text=') ? cssSelector : element.selector;
  const alternatives = element.selectorAlternatives.filter(
    (candidate) => candidate !== primarySelector && candidate !== element.selector
  );

  if (element.selector.startsWith('text=') && !alternatives.includes(element.selector)) {
    alternatives.unshift(element.selector);
  }

  const fields: ElementTargetFields = {
    elementLabel: element.label,
    selector: primarySelector,
    selectorAlternatives: alternatives,
    targetText: element.text || undefined,
    targetRole: element.role || undefined,
    targetLabel: element.label || undefined,
  };

  if (element.selector.startsWith('text=')) {
    fields.text = element.selector.replace(/^text=/, '');
  } else if (element.text) {
    fields.text = element.text;
  }

  return fields;
}

export function selectorStrategyLabel(strategy: string | undefined): string {
  switch (strategy) {
    case 'primary':
      return 'primary selector';
    case 'alternative':
      return 'backup selector';
    case 'text':
      return 'visible text match';
    case 'role':
      return 'element role match';
    case 'aria-label':
      return 'aria label match';
    default:
      return 'fallback selector';
  }
}

export function stepResultSummary(step: {
  name: string;
  action?: string;
  status: string;
  message?: string;
  selectorStrategy?: string;
  elementLabel?: string;
}): string {
  if (step.status !== 'passed') {
    return step.message || step.name;
  }

  if (step.selectorStrategy && step.selectorStrategy !== 'primary') {
    const actionVerb =
      step.action === 'fill' ? 'Filled' : step.action === 'expectVisible' ? 'Verified' : 'Clicked';
    const target = step.message?.replace(/^Used .* for /, '') || step.name;
    return `${actionVerb} ${target} using ${selectorStrategyLabel(step.selectorStrategy)}`;
  }

  return step.message || step.name;
}
