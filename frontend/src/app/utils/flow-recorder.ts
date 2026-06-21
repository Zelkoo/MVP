import { InspectedElement } from '../models/page-inspector.model';
import {
  FlowStepDefinition,
  createStepId,
  withStepIds,
} from './flow-templates';
import { buildElementTargetFields } from './element-target';
import { SuccessConditionType } from './flow-wizard';

export type RecordedActionType = 'click' | 'fill' | 'expectVisible';

export interface RecordedAction {
  id: string;
  element: InspectedElement;
  action: RecordedActionType;
  fillValue?: string;
}

export const RECORDER_PHASES = [
  'Enter URL',
  'Record actions',
  'Define success',
  'Review & run',
] as const;

export type RecorderPhase = (typeof RECORDER_PHASES)[number];

export function createRecordedAction(
  element: InspectedElement,
  action: RecordedActionType,
  fillValue?: string
): RecordedAction {
  return {
    id: createStepId(),
    element,
    action,
    fillValue: action === 'fill' ? fillValue || defaultFillValue(element) : undefined,
  };
}

export function defaultFillValue(element: InspectedElement): string {
  const label = (element.label || element.text || '').toLowerCase();
  if (label.includes('email')) return 'qa-test@example.com';
  if (label.includes('phone') || label.includes('tel')) return '555-0100';
  if (label.includes('name')) return 'QA Test User';
  if (element.tagName === 'textarea') return 'Automated test message — please ignore.';
  return 'Test value';
}

export function suggestRecordedAction(element: InspectedElement): RecordedActionType {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return 'fill';
  }
  if (element.actionTypeSuggestions?.includes('fill')) {
    return 'fill';
  }
  return 'click';
}

export function recordedActionLabel(action: RecordedActionType): string {
  switch (action) {
    case 'click':
      return 'Click this';
    case 'fill':
      return 'Fill this';
    case 'expectVisible':
      return 'Expect this visible';
    default:
      return action;
  }
}

export function plainRecordedAction(recorded: RecordedAction): string {
  const label = recorded.element.label || recorded.element.text || 'element';
  switch (recorded.action) {
    case 'click':
      return `Click ${label}`;
    case 'fill':
      return `Type "${recorded.fillValue || defaultFillValue(recorded.element)}" into ${label}`;
    case 'expectVisible':
      return `Check that ${label} is visible`;
    default:
      return label;
  }
}

export function buildRecordedFlowSteps(input: {
  startUrl: string;
  actions: RecordedAction[];
  successType: SuccessConditionType;
  successValue: string;
  successElement?: InspectedElement;
}): FlowStepDefinition[] {
  const steps: Omit<FlowStepDefinition, 'id'>[] = [
    { action: 'goto', label: 'Open the page', url: input.startUrl },
  ];

  for (const recorded of input.actions) {
    const fields = buildElementTargetFields(recorded.element);
    if (recorded.action === 'click') {
      steps.push({
        action: 'click',
        label: `Click ${fields.elementLabel || 'element'}`,
        ...fields,
      });
      continue;
    }

    if (recorded.action === 'fill') {
      steps.push({
        action: 'fill',
        label: `Fill ${fields.elementLabel || 'input'}`,
        ...fields,
        value: recorded.fillValue || defaultFillValue(recorded.element),
      });
      continue;
    }

    steps.push({
      action: 'expectVisible',
      label: `Expect ${fields.elementLabel || 'element'} visible`,
      ...fields,
    });
  }

  switch (input.successType) {
    case 'url-contains':
      steps.push({
        action: 'expectUrlContains',
        label: 'Check the URL looks correct',
        value: input.successValue,
      });
      break;
    case 'page-contains-text':
      steps.push({
        action: 'waitForText',
        label: 'Wait for success message',
        text: input.successValue,
        timeoutMs: 8000,
      });
      break;
    case 'element-visible':
      if (input.successElement) {
        const fields = buildElementTargetFields(input.successElement);
        steps.push({
          action: 'expectVisible',
          label: `Expect ${fields.elementLabel || 'element'} to appear`,
          ...fields,
        });
      }
      break;
    case 'network-2xx':
      steps.push({
        action: 'expectNetworkSuccess',
        label: 'Expect successful server response',
        value: input.successValue || undefined,
        timeoutMs: 8000,
      });
      break;
  }

  steps.push({ action: 'screenshot', label: 'Capture final screenshot' });

  return withStepIds(steps);
}
