const ASSERTION_ACTIONS = new Set([
  'waitForText',
  'expectUrlContains',
  'expectVisible',
  'expectNetworkSuccess',
]);

const INTERACTIVE_ACTIONS = new Set(['click', 'fill']);

function looksDynamic(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (/^[a-f0-9-]{16,}$/i.test(trimmed)) return true;
  if (/^(ember|react-|mui-|css-|ng-|jsx-|_|[a-z]{1,2}\d{5,})/i.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

function average(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSteps(type, config = {}, startUrl = '') {
  if (type === 'flow') {
    return Array.isArray(config.steps) ? config.steps : [];
  }

  if (type === 'contact-form') {
    return [
      { action: 'goto', url: startUrl, label: 'Open page' },
      { action: 'fill', selector: config.fields?.email?.selector, label: 'Fill email' },
      { action: 'fill', selector: config.fields?.name?.selector, label: 'Fill name' },
      { action: 'click', selector: config.submitSelector, label: 'Submit form' },
      config.success?.type === 'text'
        ? { action: 'waitForText', text: config.success.value, label: 'Check success text' }
        : { action: 'expectUrlContains', value: config.success?.value, label: 'Check URL' },
    ].filter((step) => step.selector || step.text || step.value || step.action === 'goto');
  }

  if (type === 'cta-link') {
    return [
      { action: 'goto', url: startUrl, label: 'Open page' },
      { action: 'click', selector: config.ctaSelector, text: config.ctaText, label: 'Click CTA' },
      config.expectedUrlContains
        ? { action: 'expectUrlContains', value: config.expectedUrlContains, label: 'Check URL' }
        : { action: 'waitForText', text: config.expectedText, label: 'Check page text' },
    ].filter(Boolean);
  }

  if (type === 'mobile-nav') {
    return [
      { action: 'goto', url: startUrl, label: 'Open page' },
      { action: 'click', selector: config.menuButtonSelector, label: 'Open menu' },
      { action: 'expectVisible', selector: config.navLinkSelector, label: 'Check navigation visible' },
    ];
  }

  if (type === 'broken-links') {
    return [
      { action: 'goto', url: startUrl, label: 'Open page' },
      { action: 'expectVisible', selector: 'a', label: 'Check links' },
    ];
  }

  if (type === 'checkout-smoke') {
    return [
      { action: 'goto', url: startUrl, label: 'Open page' },
      { action: 'click', selector: config.addToCartSelector, label: 'Add to cart' },
      { action: 'waitForText', text: config.expectedCartText || 'cart', label: 'Check cart updated' },
    ];
  }

  return [];
}

function scoreSingleSelector(step) {
  const selector = String(step.selector || '');
  const improvements = [];

  if (!selector && (step.targetRole || step.targetText)) {
    return { score: 72, improvement: null };
  }

  if (!selector && step.text) {
    return {
      score: 62,
      improvement: `Add a data-testid selector for "${step.elementLabel || step.label || 'this step'}".`,
    };
  }

  if (!selector) {
    return { score: 55, improvement: 'Add a stable selector for interactive steps.' };
  }

  if (/data-testid|data-test|data-cy/.test(selector)) {
    return { score: 95, improvement: null };
  }
  if (/aria-label/.test(selector)) {
    return { score: 85, improvement: null };
  }
  if (/\[name=/.test(selector)) {
    return { score: 82, improvement: null };
  }
  if (/^#[\w-]+/.test(selector) && !looksDynamic(selector.slice(1))) {
    return { score: 75, improvement: null };
  }
  if (selector.startsWith('text=')) {
    return {
      score: 65,
      improvement: `Replace the text selector with data-testid for "${step.elementLabel || step.label || 'this element'}".`,
    };
  }
  if (/nth-child|nth-of-type|:nth\(|>>|\/\/|>\s*\w+\s+>\s*\w+/.test(selector)) {
    return {
      score: 30,
      improvement: 'Avoid deep or nth-child selectors — use data-testid or aria-label instead.',
    };
  }
  if (/\.[\w-]+/.test(selector)) {
    return {
      score: 52,
      improvement: `Use data-testid instead of a class selector for "${step.label || 'this step'}".`,
    };
  }

  return { score: 60, improvement: null };
}

function scoreSelectorQuality(steps) {
  const interactive = steps.filter(
    (step) =>
      INTERACTIVE_ACTIONS.has(step.action) ||
      step.action === 'expectVisible' ||
      (step.selector && step.action !== 'goto')
  );

  if (interactive.length === 0) {
    return { score: 70, improvements: [] };
  }

  const scores = [];
  const improvements = [];

  for (const step of interactive) {
    const result = scoreSingleSelector(step);
    scores.push(result.score);
    if (result.improvement) improvements.push(result.improvement);
  }

  const withFallback = interactive.filter((step) => (step.selectorAlternatives || []).length > 0).length;
  let score = average(scores, 60);
  if (withFallback > 0) {
    score = Math.min(100, score + Math.min(8, withFallback * 3));
  }

  return { score, improvements: [...new Set(improvements)] };
}

function scoreSuccessConditions(steps) {
  const assertions = steps.filter((step) => ASSERTION_ACTIONS.has(step.action));
  const improvements = [];

  if (assertions.length === 0) {
    return {
      score: 15,
      improvements: ['Add a success check so the test knows when the flow worked.'],
    };
  }

  const hasNetwork = assertions.some((step) => step.action === 'expectNetworkSuccess');
  const hasText = assertions.some((step) => step.action === 'waitForText');
  const hasUrl = assertions.some((step) => step.action === 'expectUrlContains');
  const hasVisible = assertions.some((step) => step.action === 'expectVisible');

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
  if (!hasText && !hasNetwork && !hasUrl && hasVisible) {
    improvements.push('Add a clearer success signal such as page text or a successful server response.');
  }

  return { score, improvements };
}

function scoreFlowCompleteness(steps) {
  const improvements = [];
  let score = 0;

  const hasGoto = steps.some((step) => step.action === 'goto');
  const hasAction = steps.some((step) => INTERACTIVE_ACTIONS.has(step.action));
  const hasAssertion = steps.some((step) => ASSERTION_ACTIONS.has(step.action));
  const hasScreenshot = steps.some((step) => step.action === 'screenshot');

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

function scoreFlakinessRisk(steps) {
  const improvements = [];
  let score = 88;

  const smartWaits = steps.filter((step) =>
    ['waitForText', 'expectVisible', 'expectNetworkSuccess'].includes(step.action)
  ).length;
  score += Math.min(10, smartWaits * 4);

  const fallbackSteps = steps.filter((step) => (step.selectorAlternatives || []).length > 0).length;
  if (fallbackSteps > 0) {
    score += Math.min(8, fallbackSteps * 2);
  } else {
    const brittle = steps.filter(
      (step) =>
        INTERACTIVE_ACTIONS.has(step.action) &&
        step.selector?.startsWith('text=') &&
        !(step.selectorAlternatives || []).length
    );
    if (brittle.length > 0) {
      score -= 12;
      improvements.push('Add backup selectors so steps can recover if the primary selector fails.');
    }
  }

  const classOnly = steps.filter(
    (step) =>
      INTERACTIVE_ACTIONS.has(step.action) &&
      step.selector &&
      /\.[\w-]+/.test(step.selector) &&
      !/data-testid|data-test|data-cy|aria-label|\[name=/.test(step.selector)
  );
  if (classOnly.length > 0) {
    score -= 8;
    improvements.push('Class-based selectors often break after UI changes — prefer data-testid or aria-label.');
  }

  return { score: clamp(score), improvements };
}

function badgeForScore(score) {
  if (score >= 75) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

function labelForScore(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs work';
}

function buildExplanation(score, badge, factors) {
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

function computeTestReliability({ type = 'flow', startUrl = '', config = {}, steps = null }) {
  const normalizedSteps = steps || normalizeSteps(type, config, startUrl);

  const selector = scoreSelectorQuality(normalizedSteps);
  const success = scoreSuccessConditions(normalizedSteps);
  const completeness = scoreFlowCompleteness(normalizedSteps);
  const flakiness = scoreFlakinessRisk(normalizedSteps);

  const factors = [
    { key: 'selectors', label: 'Selector quality', score: selector.score, weight: 0.35 },
    { key: 'success', label: 'Success checks', score: success.score, weight: 0.3 },
    { key: 'completeness', label: 'Flow completeness', score: completeness.score, weight: 0.2 },
    { key: 'flakiness', label: 'Stability', score: flakiness.score, weight: 0.15 },
  ];

  const score = clamp(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0)
  );

  const improvements = [
    ...selector.improvements,
    ...success.improvements,
    ...completeness.improvements,
    ...flakiness.improvements,
  ].slice(0, 4);

  const badge = badgeForScore(score);
  const label = labelForScore(score);

  return {
    score,
    badge,
    label,
    summary: `Reliability: ${score}/100 — ${label}`,
    explanation: buildExplanation(score, badge, factors),
    improvements: [...new Set(improvements)],
    factors: factors.map(({ key, label: factorLabel, score: factorScore }) => ({
      key,
      label: factorLabel,
      score: factorScore,
    })),
  };
}

module.exports = {
  computeTestReliability,
  normalizeSteps,
  scoreSingleSelector,
};
