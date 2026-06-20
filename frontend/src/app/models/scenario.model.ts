export type ScenarioType =
  | 'flow'
  | 'contact-form'
  | 'cta-link'
  | 'mobile-nav'
  | 'broken-links'
  | 'checkout-smoke';

export type ScenarioRunStatus = 'passed' | 'failed' | 'partial' | 'error';

export interface ScenarioStep {
  name: string;
  action?: string;
  status: 'passed' | 'failed';
  message?: string;
  durationMs?: number;
  screenshotPath?: string | null;
}

export interface ScenarioIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details?: string | null;
  recommendation?: string | null;
  label?: string | null;
  description?: string | null;
}

export interface ScenarioRunResult {
  steps: ScenarioStep[];
  issues: ScenarioIssue[];
  consoleErrors: string[];
  summary?: string;
}

export interface Scenario {
  id?: number;
  name: string;
  type: ScenarioType;
  startUrl: string;
  config: Record<string, unknown>;
  createdAt?: string;
}

export interface ScenarioRun {
  id?: number;
  scenarioId: number;
  status: ScenarioRunStatus;
  score: number;
  startedAt?: string;
  finishedAt?: string;
  screenshotPath?: string | null;
  result: ScenarioRunResult;
  scenario?: Scenario;
  error?: string;
}

export interface ScenarioTypeOption {
  value: ScenarioType;
  label: string;
  description: string;
}

export const SCENARIO_TYPE_OPTIONS: ScenarioTypeOption[] = [
  {
    value: 'flow',
    label: 'Custom flow',
    description: 'Step-by-step user journey defined in the flow builder.',
  },
  {
    value: 'contact-form',
    label: 'Contact form test',
    description: 'Fill and submit a contact form, then verify success.',
  },
  {
    value: 'cta-link',
    label: 'CTA link test',
    description: 'Click a call-to-action and verify the destination.',
  },
  {
    value: 'mobile-nav',
    label: 'Mobile navigation test',
    description: 'Open the mobile menu and verify navigation links appear.',
  },
  {
    value: 'broken-links',
    label: 'Broken links test',
    description: 'Sample links on the page and report broken destinations.',
  },
  {
    value: 'checkout-smoke',
    label: 'Basic checkout smoke test',
    description: 'Add to cart only — never completes payment.',
  },
];
