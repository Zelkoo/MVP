export type FlowStepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'waitForText'
  | 'expectUrlContains'
  | 'expectVisible'
  | 'expectNetworkSuccess'
  | 'screenshot';

export interface FlowStepDefinition {
  id: string;
  action: FlowStepAction;
  label?: string;
  url?: string;
  selector?: string;
  selectorAlternatives?: string[];
  targetText?: string;
  targetRole?: string;
  targetLabel?: string;
  text?: string;
  value?: string;
  timeoutMs?: number;
  elementLabel?: string;
  showAdvanced?: boolean;
}

export interface FlowStepOption {
  action: FlowStepAction;
  label: string;
  description: string;
}

export const FLOW_STEP_OPTIONS: FlowStepOption[] = [
  { action: 'goto', label: 'Go to URL', description: 'Navigate to a page URL.' },
  { action: 'click', label: 'Click element', description: 'Click an element on the page.' },
  { action: 'fill', label: 'Fill input', description: 'Type into an input or textarea.' },
  { action: 'waitForText', label: 'Wait for text', description: 'Wait until text appears on the page.' },
  {
    action: 'expectUrlContains',
    label: 'Expect URL contains',
    description: 'Assert the current URL includes text.',
  },
  {
    action: 'expectVisible',
    label: 'Expect element visible',
    description: 'Assert an element is visible on the page.',
  },
  {
    action: 'expectNetworkSuccess',
    label: 'Expect successful request',
    description: 'Assert a network request returned a 2xx response.',
  },
  { action: 'screenshot', label: 'Take screenshot', description: 'Capture a screenshot of the current page.' },
];

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  scenarioName: string;
  steps: (startUrl: string) => Omit<FlowStepDefinition, 'id'>[];
}

export function createStepId(): string {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function withStepIds(steps: Omit<FlowStepDefinition, 'id'>[]): FlowStepDefinition[] {
  return steps.map((step) => ({ ...step, id: createStepId() }));
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'contact-form',
    name: 'Contact form test',
    description: 'Fill out a contact form and verify a thank-you message.',
    scenarioName: 'Contact form test',
    steps: (startUrl) => [
      { action: 'goto', label: 'Go to URL', url: startUrl },
      {
        action: 'fill',
        label: 'Fill name input',
        elementLabel: 'Name',
        selector: 'input[name="name"], #name',
        value: 'QA Test User',
      },
      {
        action: 'fill',
        label: 'Fill email input',
        elementLabel: 'Email',
        selector: 'input[name="email"], #email',
        value: 'qa-test@example.com',
      },
      {
        action: 'fill',
        label: 'Fill message input',
        elementLabel: 'Message',
        selector: 'textarea[name="message"], #message',
        value: 'Automated test message — please ignore.',
      },
      {
        action: 'click',
        label: 'Click submit button',
        elementLabel: 'Submit',
        selector: 'button[type="submit"], input[type="submit"]',
      },
      { action: 'waitForText', label: 'Wait for success text', text: 'thank', timeoutMs: 8000 },
    ],
  },
  {
    id: 'cta-click',
    name: 'CTA click test',
    description: 'Click a call-to-action and verify the destination page.',
    scenarioName: 'CTA click test',
    steps: (startUrl) => [
      { action: 'goto', label: 'Go to URL', url: startUrl },
      {
        action: 'click',
        label: 'Click CTA',
        elementLabel: 'Get started',
        text: 'Get started',
      },
      { action: 'expectUrlContains', label: 'Expect destination URL', value: '/signup' },
      { action: 'screenshot', label: 'Capture destination page' },
    ],
  },
  {
    id: 'add-to-cart',
    name: 'Add to cart test',
    description: 'Add a product to cart without completing checkout or payment.',
    scenarioName: 'Add to cart test',
    steps: (startUrl) => [
      { action: 'goto', label: 'Go to product URL', url: startUrl },
      {
        action: 'click',
        label: 'Click add to cart',
        elementLabel: 'Add to cart',
        selector: 'button[name="add-to-cart"], .add-to-cart, [data-testid="add-to-cart"]',
      },
      {
        action: 'expectVisible',
        label: 'Expect cart indicator visible',
        elementLabel: 'Cart indicator',
        selector: '.cart-count, .cart, [data-testid="cart"]',
      },
      { action: 'screenshot', label: 'Capture cart state' },
    ],
  },
  {
    id: 'newsletter',
    name: 'Newsletter signup test',
    description: 'Subscribe to a newsletter and verify confirmation.',
    scenarioName: 'Newsletter signup test',
    steps: (startUrl) => [
      { action: 'goto', label: 'Go to URL', url: startUrl },
      {
        action: 'fill',
        label: 'Fill email input',
        elementLabel: 'Email',
        selector: 'input[type="email"], input[name="email"]',
        value: 'qa-test@example.com',
      },
      {
        action: 'click',
        label: 'Click subscribe',
        elementLabel: 'Subscribe',
        selector: 'button[type="submit"], .subscribe, [data-testid="subscribe"]',
        text: 'Subscribe',
      },
      { action: 'waitForText', label: 'Wait for confirmation', text: 'subscribed', timeoutMs: 8000 },
    ],
  },
  {
    id: 'mobile-menu',
    name: 'Mobile menu test',
    description: 'Open the mobile menu and verify navigation links appear.',
    scenarioName: 'Mobile menu test',
    steps: (startUrl) => [
      { action: 'goto', label: 'Go to URL', url: startUrl },
      {
        action: 'click',
        label: 'Click menu button',
        elementLabel: 'Menu',
        selector: 'button[aria-label*="menu" i], .menu-toggle, [data-testid="menu-button"]',
        text: 'Menu',
      },
      {
        action: 'expectVisible',
        label: 'Expect navigation visible',
        elementLabel: 'Navigation',
        selector: 'nav, .mobile-nav, [role="navigation"]',
      },
      { action: 'screenshot', label: 'Capture open menu' },
    ],
  },
];

export function actionLabel(action: FlowStepAction): string {
  return FLOW_STEP_OPTIONS.find((option) => option.action === action)?.label || action;
}

export function stepSummary(step: FlowStepDefinition, startUrl = ''): string {
  const target = step.elementLabel || step.text || step.selector || step.label || '';

  switch (step.action) {
    case 'goto':
      return `Go to ${step.url || startUrl || 'URL'}`;
    case 'click':
      return target ? `Click ${target}` : 'Click element';
    case 'fill':
      return target
        ? `Fill ${target} with ${step.value || 'value'}`
        : `Fill input with ${step.value || 'value'}`;
    case 'waitForText':
      return `Expect text: ${step.text || '…'}`;
    case 'expectUrlContains':
      return `Expect URL contains: ${step.value || '…'}`;
    case 'expectVisible':
      return target ? `Expect visible: ${target}` : 'Expect element visible';
    case 'expectNetworkSuccess':
      return step.value
        ? `Expect 2xx response matching: ${step.value}`
        : 'Expect successful 2xx response';
    case 'screenshot':
      return 'Take screenshot';
    default:
      return actionLabel(step.action);
  }
}

export function supportsElementPicker(action: FlowStepAction): boolean {
  return action === 'click' || action === 'fill' || action === 'expectVisible';
}

export function serializeSteps(steps: FlowStepDefinition[], startUrl: string) {
  return steps.map(({ id, showAdvanced, ...step }) => {
    const payload = { ...step };
    if (payload.action === 'goto' && !payload.url) {
      payload.url = startUrl;
    }
    if (payload.selectorAlternatives?.length === 0) {
      delete payload.selectorAlternatives;
    }
    return payload;
  });
}

export function suggestedActionFromElement(
  suggestions: string[] | undefined,
  fallback: FlowStepAction = 'click'
): FlowStepAction {
  const first = suggestions?.[0];
  if (first === 'fill') return 'fill';
  if (first === 'click') return 'click';
  if (first === 'expectVisible') return 'expectVisible';
  return fallback;
}
