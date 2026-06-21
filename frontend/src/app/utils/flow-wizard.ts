import { InspectedElement } from '../models/page-inspector.model';
import { FlowStepAction, FlowStepDefinition, createStepId, withStepIds } from './flow-templates';
import { buildElementTargetFields } from './element-target';

export type WizardTestType =
  | 'contact-form'
  | 'cta-button'
  | 'add-to-cart'
  | 'checkout-start'
  | 'newsletter'
  | 'mobile-menu'
  | 'custom-flow';

export type SuccessConditionType =
  | 'url-contains'
  | 'page-contains-text'
  | 'element-visible'
  | 'network-2xx';

export interface WizardTestOption {
  id: WizardTestType;
  title: string;
  description: string;
  defaultName: string;
}

export interface WizardElementSlot {
  id: string;
  prompt: string;
  helper: string;
  actionType: 'click' | 'fill';
  element?: InspectedElement;
}

export interface SuccessConditionOption {
  id: SuccessConditionType;
  title: string;
  description: string;
  placeholder?: string;
  inputLabel?: string;
}

export interface WizardReviewItem {
  title: string;
  detail: string;
}

export const WIZARD_STEPS = [
  'Enter URL',
  'Choose a test',
  'Confirm elements',
  'Choose success',
  'Review test',
  'Run test',
];

export const WIZARD_TEST_OPTIONS: WizardTestOption[] = [
  {
    id: 'contact-form',
    title: 'Contact form',
    description: 'Fill out a form and confirm it submits successfully.',
    defaultName: 'Contact form test',
  },
  {
    id: 'cta-button',
    title: 'CTA button',
    description: 'Click a call-to-action and verify where it leads.',
    defaultName: 'CTA button test',
  },
  {
    id: 'add-to-cart',
    title: 'Add to cart',
    description: 'Add a product to the cart without completing checkout.',
    defaultName: 'Add to cart test',
  },
  {
    id: 'checkout-start',
    title: 'Checkout start',
    description: 'Begin checkout and confirm the checkout page loads.',
    defaultName: 'Checkout start test',
  },
  {
    id: 'newsletter',
    title: 'Newsletter signup',
    description: 'Subscribe with an email address and verify confirmation.',
    defaultName: 'Newsletter signup test',
  },
  {
    id: 'mobile-menu',
    title: 'Mobile menu',
    description: 'Open the mobile menu and confirm navigation appears.',
    defaultName: 'Mobile menu test',
  },
  {
    id: 'custom-flow',
    title: 'Custom flow',
    description: 'Pick one main action and define your own success check.',
    defaultName: 'Custom flow test',
  },
];

export const SUCCESS_CONDITION_OPTIONS: SuccessConditionOption[] = [
  {
    id: 'page-contains-text',
    title: 'Page shows success text',
    description: 'Look for a message like "Thank you" after the action completes.',
    placeholder: 'Thank you',
    inputLabel: 'Text to look for',
  },
  {
    id: 'url-contains',
    title: 'The URL changes',
    description: 'The browser address should include a specific path or phrase.',
    placeholder: '/thank-you',
    inputLabel: 'URL should contain',
  },
  {
    id: 'element-visible',
    title: 'Something new appears',
    description: 'A specific element should become visible after the action.',
    inputLabel: 'Selected element that proves success',
  },
  {
    id: 'network-2xx',
    title: 'Server responds successfully',
    description: 'A form submit or API call should return a successful response.',
    placeholder: '/api/contact',
    inputLabel: 'Optional: request URL contains (leave blank for any success)',
  },
];

export function getDefaultSuccessType(testType: WizardTestType): SuccessConditionType {
  switch (testType) {
    case 'cta-button':
    case 'checkout-start':
      return 'url-contains';
    case 'contact-form':
    case 'newsletter':
      return 'page-contains-text';
    case 'add-to-cart':
    case 'mobile-menu':
      return 'element-visible';
    default:
      return 'page-contains-text';
  }
}

export function getDefaultSuccessValue(testType: WizardTestType, successType: SuccessConditionType): string {
  if (successType === 'url-contains') {
    if (testType === 'checkout-start') return '/checkout';
    if (testType === 'cta-button') return '/';
    return '/thank';
  }
  if (successType === 'page-contains-text') {
    if (testType === 'newsletter') return 'subscribed';
    return 'thank';
  }
  return '';
}

export function getElementSlots(testType: WizardTestType): WizardElementSlot[] {
  switch (testType) {
    case 'contact-form':
      return [
        {
          id: 'submit',
          prompt: 'Select the submit button',
          helper: 'Click the button that sends the contact form.',
          actionType: 'click',
        },
      ];
    case 'cta-button':
      return [
        {
          id: 'cta',
          prompt: 'Select the CTA button',
          helper: 'Click the main call-to-action you want to test.',
          actionType: 'click',
        },
      ];
    case 'add-to-cart':
      return [
        {
          id: 'addToCart',
          prompt: 'Select the add to cart button',
          helper: 'Click the button that adds the product to the cart.',
          actionType: 'click',
        },
      ];
    case 'checkout-start':
      return [
        {
          id: 'checkout',
          prompt: 'Select the checkout button',
          helper: 'Click the button that starts checkout.',
          actionType: 'click',
        },
      ];
    case 'newsletter':
      return [
        {
          id: 'email',
          prompt: 'Select the email input',
          helper: 'Click the field where users enter their email.',
          actionType: 'fill',
        },
        {
          id: 'submit',
          prompt: 'Select the subscribe button',
          helper: 'Click the button that submits the signup form.',
          actionType: 'click',
        },
      ];
    case 'mobile-menu':
      return [
        {
          id: 'menu',
          prompt: 'Select the menu button',
          helper: 'Click the button that opens the mobile navigation.',
          actionType: 'click',
        },
      ];
    default:
      return [
        {
          id: 'action',
          prompt: 'Select the main element to test',
          helper: 'Click the button, link, or input you want this test to use.',
          actionType: 'click',
        },
      ];
  }
}

export function elementToStepFields(
  element: InspectedElement,
  actionType: 'click' | 'fill' | 'expectVisible'
): Pick<FlowStepDefinition, 'selector' | 'selectorAlternatives' | 'targetText' | 'targetRole' | 'targetLabel' | 'text' | 'elementLabel' | 'value'> {
  const targetFields = buildElementTargetFields(element);
  const fields: Pick<
    FlowStepDefinition,
    'selector' | 'selectorAlternatives' | 'targetText' | 'targetRole' | 'targetLabel' | 'text' | 'elementLabel' | 'value'
  > = {
    ...targetFields,
  };

  if (actionType === 'fill') {
    fields.value = 'qa-test@example.com';
  }

  return fields;
}

function contactFormFillSteps(): Omit<FlowStepDefinition, 'id'>[] {
  return [
    {
      action: 'fill',
      label: 'Fill name',
      elementLabel: 'Name',
      selector: 'input[name="name"], #name',
      value: 'QA Test User',
    },
    {
      action: 'fill',
      label: 'Fill email',
      elementLabel: 'Email',
      selector: 'input[name="email"], #email',
      value: 'qa-test@example.com',
    },
    {
      action: 'fill',
      label: 'Fill message',
      elementLabel: 'Message',
      selector: 'textarea[name="message"], #message',
      value: 'Automated test message — please ignore.',
    },
  ];
}

export function generateWizardSteps(input: {
  testType: WizardTestType;
  startUrl: string;
  elementSlots: WizardElementSlot[];
  successType: SuccessConditionType;
  successValue: string;
  successElement?: InspectedElement;
}): FlowStepDefinition[] {
  const steps: Omit<FlowStepDefinition, 'id'>[] = [
    { action: 'goto', label: 'Open the page', url: input.startUrl },
  ];

  if (input.testType === 'contact-form') {
    steps.push(...contactFormFillSteps());
  }

  for (const slot of input.elementSlots) {
    if (!slot.element) continue;

    const fields = elementToStepFields(slot.element, slot.actionType);
    steps.push({
      action: slot.actionType,
      label:
        slot.actionType === 'fill'
          ? `Fill ${fields.elementLabel || 'input'}`
          : `Click ${fields.elementLabel || 'element'}`,
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
        const fields = elementToStepFields(input.successElement, 'expectVisible');
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

export function buildWizardReview(input: {
  testType: WizardTestType;
  startUrl: string;
  elementSlots: WizardElementSlot[];
  successType: SuccessConditionType;
  successValue: string;
  successElement?: InspectedElement;
}): WizardReviewItem[] {
  const test = WIZARD_TEST_OPTIONS.find((option) => option.id === input.testType);
  const success = SUCCESS_CONDITION_OPTIONS.find((option) => option.id === input.successType);
  const items: WizardReviewItem[] = [
    { title: 'Test type', detail: test?.title || input.testType },
    { title: 'Start URL', detail: input.startUrl },
  ];

  for (const slot of input.elementSlots) {
    items.push({
      title: slot.prompt,
      detail: slot.element?.label || 'Not selected yet',
    });
  }

  if (input.successType === 'element-visible') {
    items.push({
      title: success?.title || 'Success check',
      detail: input.successElement?.label || 'Not selected yet',
    });
  } else {
    items.push({
      title: success?.title || 'Success check',
      detail: input.successValue || 'Any successful response',
    });
  }

  return items;
}

export function plainStepDescription(step: FlowStepDefinition, startUrl = ''): string {
  switch (step.action) {
    case 'goto':
      return `Open ${step.url || startUrl}`;
    case 'click':
      return `Click ${step.elementLabel || step.text || 'the selected element'}`;
    case 'fill':
      return `Type "${step.value || ''}" into ${step.elementLabel || 'the selected input'}`;
    case 'waitForText':
      return `Wait until the page shows "${step.text || ''}"`;
    case 'expectUrlContains':
      return `Confirm the URL contains "${step.value || ''}"`;
    case 'expectVisible':
      return `Confirm ${step.elementLabel || 'the selected element'} is visible`;
    case 'expectNetworkSuccess':
      return step.value
        ? `Confirm a successful server response containing "${step.value}"`
        : 'Confirm a successful server response (2xx)';
    case 'screenshot':
      return 'Take a screenshot of the result';
    default:
      return step.label || step.action;
  }
}

export function developerStepPreview(step: FlowStepDefinition): string {
  const payload: Record<string, unknown> = { action: step.action };
  if (step.url) payload['url'] = step.url;
  if (step.selector) payload['selector'] = step.selector;
  if (step.text) payload['text'] = step.text;
  if (step.value) payload['value'] = step.value;
  if (step.timeoutMs) payload['timeoutMs'] = step.timeoutMs;
  return JSON.stringify(payload, null, 2);
}

export function cloneElementSlots(slots: WizardElementSlot[]): WizardElementSlot[] {
  return slots.map((slot) => ({ ...slot, element: slot.element }));
}

export function createEmptySlotState(testType: WizardTestType): WizardElementSlot[] {
  return getElementSlots(testType).map((slot) => ({ ...slot }));
}

export function allSlotsFilled(slots: WizardElementSlot[]): boolean {
  return slots.every((slot) => Boolean(slot.element));
}

export function currentSlotIndex(slots: WizardElementSlot[]): number {
  return slots.findIndex((slot) => !slot.element);
}

export function createStepIdForWizard(): string {
  return createStepId();
}
