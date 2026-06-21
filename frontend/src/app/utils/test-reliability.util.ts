import { FlowStepDefinition, serializeSteps } from './flow-templates';
import { ReliabilityBadge, TestReliabilityInput, TestReliabilityResult } from '../models/test-reliability.model';

const ASSERTION_ACTIONS = new Set([
  'waitForText',
  'expectUrlContains',
  'expectVisible',
  'expectNetworkSuccess',
]);

const INTERACTIVE_ACTIONS = new Set(['click', 'fill']);

function looksDynamic(value: string): boolean {
  if (/^[a-f0-9-]{16,}$/i.test(value)) return true;
  if (/^(ember|react-|mui-|css-|ng-|jsx-|_|[a-z]{1,2}\d{5,})/i.test(value)) return true;
  if (/^\d+$/.test(value)) return true;
  return false;
}

function average(values: number[], fallback = 0): number {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scoreSingleSelector(step: Record<string, unknown>): { score: number; improvement: string | null } {
  const selector = String(step['selector'] || '');
  const label = String(step['elementLabel'] || step['label'] || 'this step');

  if (!selector && (step['targetRole'] || step['targetText'])) {
    return { score: 72, improvement: null };
  }

  if (!selector && step['text']) {
    return { score: 62, improvement: `Add a data-testid selector for "${label}".` };
  }

  if (!selector) {
    return { score: 55, improvement: 'Add a stable selector for interactive steps.' };
  }

  if (/data-testid|data-test|data-cy/.test(selector)) return { score: 95, improvement: null };
  if (/aria-label/.test(selector)) return { score: 85, improvement: null };
  if (/\[name=/.test(selector)) return { score: 82, improvement: null };
  if (/^#[\w-]+/.test(selector) && !looksDynamic(selector.slice(1))) return { score: 75, improvement: null };
  if (selector.startsWith('text=')) {
    return { score: 65, improvement: `Replace the text selector with data-testid for "${label}".` };
  }
  if (/nth-child|nth-of-type|:nth\(|>>|\/\/|>\s*\w+\s+>\s*\w+/.test(selector)) {
    return {
      score: 30,
      improvement: 'Avoid deep or nth-child selectors — use data-testid or aria-label instead.',
    };
  }
  if (/\.[\w-]+/.test(selector)) {
    return { score: 52, improvement: `Use data-testid instead of a class selector for "${label}".` };
  }

  return { score: 60, improvement: null };
}

function scoreSelectorQuality(steps: Record<string, unknown>[]) {
  const interactive = steps.filter(
    (step) =>
      INTERACTIVE_ACTIONS.has(String(step['action'])) ||
      step['action'] === 'expectVisible' ||
      (step['selector'] && step['action'] !== 'goto')
  );

  if (interactive.length === 0) {
    return { score: 70, improvements: [] as string[] };
  }

  const scores: number[] = [];
  const improvements: string[] = [];

  for (const step of interactive) {
    const result = scoreSingleSelector(step);
    scores.push(result.score);
    if (result.improvement) improvements.push(result.improvement);
  }

  const withFallback = interactive.filter(
    (step) => ((step['selectorAlternatives'] as string[] | undefined) || []).length > 0
  ).length;

  let score = average(scores, 60);
  if (withFallback > 0) {
    score = Math.min(100, score + Math.min(8, withFallback * 3));
  }

  return { score, improvements: [...new Set(improvements)] };
}

function scoreSuccessConditions(steps: Record<string, unknown>[]) {
  const assertions = steps.filter((step) => ASSERTION_ACTIONS.has(String(step['action'])));
  const improvements: string[] = [];

  if (assertions.length === 0) {
    return {
      score: 15,
      improvements: ['Add a success check so the test knows when the flow worked.'],
    };
  }

  const hasNetwork = assertions.some((step) => step['action'] === 'expectNetworkSuccess');
  const hasText = assertions.some((step) => step['action'] === 'waitForText');
  const hasUrl = assertions.some((step) => step['action'] === 'expectUrlContains');
  const hasVisible = assertions.some((step) => step['action'] === 'expectVisible');

  let score = 50;

  if (hasNetwork && hasText) score = 95;
  else if (hasNetwork) score = 82;
  else if (hasText && hasUrl) score = 78;
  else if (hasText) score = 80;
  else if (hasUrl && hasVisible) score = 68;
  else if (hasUrl) score = 58;
  else if (hasVisible) score = 62;

  if (assertions.length >= 2 && score < 90) {
    score = Math.min(100, score + 8);
  }

  if (hasUrl && !hasText && !hasNetwork) {
    improvements.push('Add a success message check in addition to the URL check.');
  }
  if (hasVisible && !hasText && !hasNetwork) {
    improvements.push('Pair element visibility with a success message or network check when possible.');
  }

  return { score, improvements };
}

function scoreFlowCompleteness(steps: Record<string, unknown>[]) {
  const improvements: string[] = [];
  let score = 0;

  const hasGoto = steps.some((step) => step['action'] === 'goto');
  const hasAction = steps.some((step) => INTERACTIVE_ACTIONS.has(String(step['action'])));
  const hasAssertion = steps.some((step) => ASSERTION_ACTIONS.has(String(step['action'])));
  const hasScreenshot = steps.some((step) => step['action'] === 'screenshot');

  if (hasGoto) score += 25;
  else improvements.push('Start the test with an open-page step.');

  if (hasAction) score += 25;
  else improvements.push('Add at least one user action such as click or fill.');

  if (hasAssertion) score += 30;
  else improvements.push('Add an assertion that verifies success.');

  if (hasScreenshot) score += 20;
  else improvements.push('Add a screenshot step to capture the final state after the test runs.');

  return { score: Math.min(100, score), improvements };
}

function scoreFlakinessRisk(steps: Record<string, unknown>[]) {
  const improvements: string[] = [];
  let score = 88;

  const smartWaits = steps.filter((step) =>
    ['waitForText', 'expectVisible', 'expectNetworkSuccess'].includes(String(step['action']))
  ).length;
  score += Math.min(10, smartWaits * 4);

  const fallbackSteps = steps.filter(
    (step) => ((step['selectorAlternatives'] as string[] | undefined) || []).length > 0
  ).length;

  if (fallbackSteps > 0) {
    score += Math.min(8, fallbackSteps * 2);
  } else {
    const brittle = steps.filter(
      (step) =>
        INTERACTIVE_ACTIONS.has(String(step['action'])) &&
        String(step['selector'] || '').startsWith('text=') &&
        !((step['selectorAlternatives'] as string[] | undefined) || []).length
    );
    if (brittle.length > 0) {
      score -= 12;
      improvements.push('Add backup selectors so steps can recover if the primary selector fails.');
    }
  }

  const classOnly = steps.filter(
    (step) =>
      INTERACTIVE_ACTIONS.has(String(step['action'])) &&
      step['selector'] &&
      /\.[\w-]+/.test(String(step['selector'])) &&
      !/data-testid|data-test|data-cy|aria-label|\[name=/.test(String(step['selector']))
  );
  if (classOnly.length > 0) {
    score -= 8;
    improvements.push('Class-based selectors often break after UI changes — prefer data-testid or aria-label.');
  }

  return { score: clamp(score), improvements };
}

function badgeForScore(score: number): ReliabilityBadge {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

function labelForScore(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs work';
}

function buildExplanation(
  score: number,
  factors: Array<{ label: string; score: number }>
): string {
  const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
  if (score >= 85) {
    return 'This test uses stable selectors and clear success checks, so it should be trustworthy in most runs.';
  }
  if (score >= 75) {
    return 'This test is in good shape, with a few areas that could be hardened before scheduling.';
  }
  if (score >= 50) {
    return `This test may be flaky because ${weakest.label.toLowerCase()} is only moderate. Review the suggestions below before relying on it.`;
  }
  return 'This test needs stronger selectors and success checks before it can be trusted in CI or scheduled runs.';
}

export function computeTestReliability(input: TestReliabilityInput): TestReliabilityResult {
  const steps =
    input.steps ||
    ((input.config?.['steps'] as Record<string, unknown>[] | undefined) || []);

  const selector = scoreSelectorQuality(steps);
  const success = scoreSuccessConditions(steps);
  const completeness = scoreFlowCompleteness(steps);
  const flakiness = scoreFlakinessRisk(steps);

  const factors = [
    { key: 'selectors', label: 'Selector quality', score: selector.score, weight: 0.35 },
    { key: 'success', label: 'Success checks', score: success.score, weight: 0.3 },
    { key: 'completeness', label: 'Flow completeness', score: completeness.score, weight: 0.2 },
    { key: 'flakiness', label: 'Stability', score: flakiness.score, weight: 0.15 },
  ];

  const score = clamp(factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0));
  const badge = badgeForScore(score);
  const label = labelForScore(score);

  const improvements = [
    ...selector.improvements,
    ...success.improvements,
    ...completeness.improvements,
    ...flakiness.improvements,
  ].slice(0, 4);

  return {
    score,
    badge,
    label,
    summary: `Reliability: ${score}/100 — ${label}`,
    explanation: buildExplanation(score, factors),
    improvements: [...new Set(improvements)],
    factors: factors.map(({ key, label: factorLabel, score: factorScore }) => ({
      key,
      label: factorLabel,
      score: factorScore,
    })),
  };
}

export function computeFlowStepsReliability(
  steps: FlowStepDefinition[],
  startUrl = ''
): TestReliabilityResult {
  return computeTestReliability({
    type: 'flow',
    startUrl,
    steps: serializeSteps(steps, startUrl),
  });
}

export function reliabilityBadgeClass(badge: ReliabilityBadge): string {
  if (badge === 'High') return 'reliability-high';
  if (badge === 'Medium') return 'reliability-medium';
  return 'reliability-low';
}

export function reliabilityScoreClass(score: number): string {
  if (score >= 75) return 'reliability-high';
  if (score >= 50) return 'reliability-medium';
  return 'reliability-low';
}
