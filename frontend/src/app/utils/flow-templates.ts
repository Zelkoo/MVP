export type FlowStepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'waitForText'
  | 'expectUrlContains'
  | 'expectVisible'
  | 'screenshot';

export interface FlowStepDefinition {
  id: string;
  action: FlowStepAction;
  label?: string;
  url?: string;
  selector?: string;
  text?: string;
  value?: string;
  timeoutMs?: number;
}

export interface FlowStepOption {
  action: FlowStepAction;
  label: string;
  description: string;
}

export const FLOW_STEP_OPTIONS: FlowStepOption[] = [
  { action: 'goto', label: 'Go to URL', description: 'Navigate to a page URL.' },
  { action: 'click', label: 'Click element', description: 'Click by CSS selector or visible text.' },
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
    name: 'Contact form',
    description: 'Fill out a contact form and verify a thank-you message.',
    scenarioName: 'Contact form flow',
    steps: (startUrl) => [
      { action: 'goto', label: 'Open contact page', url: startUrl },
      { action: 'fill', label: 'Fill name', selector: 'input[name="name"], #name', value: 'QA Test User' },
      {
        action: 'fill',
        label: 'Fill email',
        selector: 'input[name="email"], #email',
        value: 'qa-test@example.com',
      },
      {
        action: 'fill',
        label: 'Fill message',
        selector: 'textarea[name="message"], #message',
        value: 'Automated test message — please ignore.',
      },
      {
        action: 'click',
        label: 'Submit form',
        selector: 'button[type="submit"], input[type="submit"]',
      },
      { action: 'waitForText', label: 'Wait for thank-you', text: 'thank', timeoutMs: 8000 },
      { action: 'screenshot', label: 'Capture confirmation' },
    ],
  },
  {
    id: 'book-a-call',
    name: 'Book a call',
    description: 'Click a booking CTA and verify the scheduling UI appears.',
    scenarioName: 'Book a call flow',
    steps: (startUrl) => [
      { action: 'goto', label: 'Open homepage', url: startUrl },
      { action: 'click', label: 'Click book a call', text: 'Book a call' },
      {
        action: 'expectVisible',
        label: 'Verify booking widget',
        selector: 'form, [data-testid="booking"], .calendar, iframe',
      },
      { action: 'screenshot', label: 'Capture booking page' },
    ],
  },
  {
    id: 'add-to-cart',
    name: 'Add to cart',
    description: 'Add a product to cart without completing checkout or payment.',
    scenarioName: 'Add to cart flow',
    steps: (startUrl) => [
      { action: 'goto', label: 'Open product page', url: startUrl },
      {
        action: 'click',
        label: 'Click add to cart',
        selector: 'button[name="add-to-cart"], .add-to-cart, [data-testid="add-to-cart"]',
      },
      {
        action: 'expectVisible',
        label: 'Verify cart updated',
        selector: '.cart-count, .cart, [data-testid="cart"]',
      },
      { action: 'screenshot', label: 'Capture cart state' },
    ],
  },
  {
    id: 'newsletter',
    name: 'Newsletter signup',
    description: 'Subscribe to a newsletter and verify confirmation.',
    scenarioName: 'Newsletter signup flow',
    steps: (startUrl) => [
      { action: 'goto', label: 'Open page', url: startUrl },
      {
        action: 'fill',
        label: 'Fill email',
        selector: 'input[type="email"], input[name="email"]',
        value: 'qa-test@example.com',
      },
      {
        action: 'click',
        label: 'Click subscribe',
        selector: 'button[type="submit"], .subscribe, [data-testid="subscribe"]',
        text: 'Subscribe',
      },
      { action: 'waitForText', label: 'Wait for confirmation', text: 'subscribed', timeoutMs: 8000 },
      { action: 'screenshot', label: 'Capture signup confirmation' },
    ],
  },
];

export function actionLabel(action: FlowStepAction): string {
  return FLOW_STEP_OPTIONS.find((option) => option.action === action)?.label || action;
}

export function serializeSteps(steps: FlowStepDefinition[], startUrl: string) {
  return steps.map(({ id, ...step }) => {
    const payload = { ...step };
    if (payload.action === 'goto' && !payload.url) {
      payload.url = startUrl;
    }
    return payload;
  });
}
