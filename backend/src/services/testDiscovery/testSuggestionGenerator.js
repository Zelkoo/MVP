function step(action, label, extra = {}) {
  return { action, label, ...extra };
}

const { truncateText, createShortSuggestionTitle } = require('./suggestionTitle');

function elementTarget(element) {
  if (!element) return {};
  return {
    selector: element.selector,
    selectorAlternatives: element.selectorAlternatives || [],
    elementLabel: element.humanLabel || element.text || element.ariaLabel || 'element',
    targetLabel: element.humanLabel || element.text || element.ariaLabel || 'element',
    targetText: element.text || undefined,
  };
}

function confidenceLabel(score) {
  if (score >= 0.85) return 'high';
  if (score >= 0.7) return 'medium';
  return 'low';
}

function titleForBehavior(behavior, pageUrl) {
  return createShortSuggestionTitle(behavior, pageUrl);
}

function buildSteps(behavior, pageUrl) {
  const action = behavior.action.element;
  const label = behavior.action.humanLabel || action.text || 'control';

  switch (behavior.type) {
    case 'dynamic-element-created-and-removable': {
      const generated = behavior.generatedElement;
      const generatedLabel = generated.humanLabel || generated.text || 'generated control';
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectVisible', `Expect ${generatedLabel} visible`, elementTarget(generated)),
        step('click', `Click ${generatedLabel}`, {
          ...elementTarget(generated),
          safetyLevel: 'safe-generated-element',
        }),
        step('expectHidden', `Expect ${generatedLabel} hidden`, elementTarget(generated)),
        step('screenshot', 'Capture final screenshot'),
      ];
    }
    case 'dynamic-element-created': {
      const created = behavior.createdElements?.[0];
      const createdLabel = created?.humanLabel || created?.text || 'new control';
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectVisible', `Expect ${createdLabel} visible`, elementTarget(created)),
        step('screenshot', 'Capture final screenshot'),
      ];
    }
    case 'dropdown-selection':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('fill', `Select ${behavior.selectedLabel || behavior.selectedValue}`, {
          selector: action.selector,
          value: behavior.selectedValue,
          elementLabel: label,
        }),
        step('expectVisible', 'Confirm dropdown updated', elementTarget(action)),
        step('screenshot', 'Capture final screenshot'),
      ];
    case 'checkbox-toggle':
    case 'radio-selection':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Toggle ${label}`, elementTarget(action)),
        step('expectVisible', 'Confirm control state changed', elementTarget(behavior.controlElement || action)),
        step('screenshot', 'Capture final screenshot'),
      ];
    case 'toggle-visibility':
    case 'expand-collapse':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectVisible', 'Confirm content visibility changed', elementTarget(behavior.targetElement || action)),
        step('screenshot', 'Capture final screenshot'),
      ];
    case 'modal-open-close':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectVisible', 'Expect modal visible', elementTarget(behavior.modalElement)),
        step('screenshot', 'Capture modal'),
      ];
    case 'hover-reveal': {
      const revealed = behavior.revealedElement || behavior.action.element;
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('hover', `Hover ${label}`, elementTarget(action)),
        step('expectVisible', `Expect revealed content visible`, elementTarget(revealed)),
        step('screenshot', 'Capture hover result'),
      ];
    }
    case 'tab-switch':
    case 'menu-open-close':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectVisible', 'Confirm page state changed', elementTarget(behavior.targetElement || action)),
        step('screenshot', 'Capture final screenshot'),
      ];
    case 'text-update':
    case 'color-input-changed':
    case 'range-input-changed':
    case 'keyboard-response':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('fill', `Update ${label}`, {
          ...elementTarget(action),
          value: behavior.after?.elements?.find((el) => el.signature === action.signature)?.value,
        }),
        step('expectVisible', 'Confirm control updated', elementTarget(behavior.controlElement || action)),
        step('screenshot', 'Capture final screenshot'),
      ];
    case 'dynamic-loading': {
      const waitText =
        behavior.finalText ||
        behavior.after?.visibleTexts?.find((text) => text.length >= 4) ||
        behavior.after?.visibleTexts?.[0];
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('waitForText', 'Wait for loaded content', {
          text: waitText || 'content',
          timeoutMs: 10000,
        }),
        step('expectVisible', 'Expect final content visible', elementTarget(behavior.action.element)),
        step('screenshot', 'Capture final screenshot'),
      ];
    }
    case 'navigation': {
      let path = '/';
      try {
        path = new URL(behavior.destinationUrl).pathname || '/';
      } catch {
        path = behavior.destinationUrl || '/';
      }
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('expectUrlContains', 'Confirm navigation', { value: path.replace(/^\//, '') || '/' }),
        step('screenshot', 'Capture destination page'),
      ];
    }
    case 'login-error':
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('fill', 'Fill username', { selector: behavior.usernameSelector, value: 'invalid-user', elementLabel: 'username' }),
        step('fill', 'Fill password', { selector: behavior.passwordSelector, value: 'invalid-password', elementLabel: 'password' }),
        step('click', 'Click login', { selector: behavior.submitSelector, elementLabel: 'login' }),
        step('waitForText', 'Expect error message', { text: 'invalid', timeoutMs: 8000 }),
        step('screenshot', 'Capture final screenshot'),
      ];
    default:
      return [
        step('goto', 'Open page', { url: pageUrl }),
        step('click', `Click ${label}`, elementTarget(action)),
        step('screenshot', 'Capture result'),
      ];
  }
}

function reliabilityScore(behavior) {
  const base = behavior.confidence || 0.7;
  const evidenceBoost = Math.min((behavior.reasoning || []).length * 0.03, 0.12);
  const safetyPenalty =
    behavior.safety?.safetyLevel === 'requires-confirmation'
      ? 0.08
      : behavior.safety?.safetyLevel === 'unsafe-skipped'
        ? 0.2
        : 0;
  return Math.round(Math.max(0.35, Math.min(0.98, base + evidenceBoost - safetyPenalty)) * 100);
}

function whySuggested(behavior) {
  const reasons = [...(behavior.reasoning || [])];
  if (behavior.summary && !reasons.includes(behavior.summary)) {
    reasons.unshift(behavior.summary);
  }
  for (const change of behavior.diff?.changes || []) {
    if (change.description && !reasons.includes(change.description)) {
      reasons.push(change.description);
    }
  }
  return reasons.slice(0, 6);
}

function generateTestSuggestion(behavior, pageUrl, pageTitle) {
  const steps = buildSteps(behavior, pageUrl);
  const confidence = behavior.confidence || 0.7;
  const suggestion = {
    id: `${behavior.type}-${pageUrl}-${behavior.action.element.signature}`,
    type: behavior.type,
    patternType: behavior.type,
    category: behavior.type,
    title: titleForBehavior(behavior, pageUrl),
    description: behavior.summary,
    businessValue: 'Verifies observed UI behavior works as expected for real users.',
    sourceUrl: pageUrl,
    sourcePageTitle: pageTitle,
    startUrl: pageUrl,
    primaryLabel: behavior.action.humanLabel,
    selectorOrLabel: behavior.generatedElement?.selector || behavior.action.element.selector,
    safetyLevel: behavior.safety?.safetyLevel || 'safe',
    confidence,
    confidenceLevel: behavior.confidenceLevel || confidenceLabel(confidence),
    discoveredBehavior: {
      summary: behavior.summary,
      type: behavior.type,
      before: {
        url: behavior.before?.url,
        title: behavior.before?.title,
        elementCount: behavior.before?.elementCount,
      },
      after: {
        url: behavior.after?.url,
        title: behavior.after?.title,
        elementCount: behavior.after?.elementCount,
      },
    },
    detectedBehavior: {
      type: behavior.type,
      description: behavior.summary,
    },
    generatedSteps: steps.filter((entry) => entry.action !== 'screenshot'),
    generatedStepsPreview: steps.filter((entry) => entry.action !== 'screenshot').map((entry) => entry.label),
    steps,
    successConditions: [
      {
        label: 'Observed behavior verified',
        description: behavior.summary,
      },
    ],
    reasoning: behavior.reasoning || [],
    discoveryReasons: behavior.reasoning || [],
    whySuggested: whySuggested(behavior),
    reliabilityScore: reliabilityScore(behavior),
    visualEvidence: behavior.visualEvidence || null,
    flowSummary: behavior.flowSummary || null,
    pagesInvolved: behavior.pagesInvolved || null,
    generatedBy: 'crawler',
    scenarioType: 'flow',
  };

  return suggestion;
}

function detectLoginFormSuggestion(pageUrl, pageTitle, pageState) {
  const passwordField = pageState.elements.find((el) => el.tagName === 'input' && el.type === 'password');
  const usernameField = pageState.elements.find(
    (el) =>
      el.tagName === 'input' &&
      ['text', 'email', ''].includes(el.type) &&
      /user|email|login|name/i.test(`${el.name} ${el.placeholder} ${el.ariaLabel} ${el.id}`)
  );
  const submit = pageState.elements.find(
    (el) =>
      (el.tagName === 'button' || el.type === 'submit') &&
      /login|log in|sign in|submit/i.test(`${el.text} ${el.ariaLabel}`)
  );

  if (!passwordField || !usernameField || !submit) return null;

  return generateTestSuggestion(
    {
      type: 'login-error',
      summary: 'Submit invalid credentials and expect a visible error message.',
      confidence: 0.74,
      confidenceLevel: 'medium',
      action: { element: submit, humanLabel: submit.humanLabel || 'login' },
      before: pageState,
      after: pageState,
      diff: { changes: [] },
      safety: { safetyLevel: 'requires-confirmation' },
      usernameSelector: usernameField.selector,
      passwordSelector: passwordField.selector,
      submitSelector: submit.selector,
      reasoning: [
        'Username and password fields were detected on the page.',
        'A login submit control was detected.',
        'Invalid credential submission should be confirmed manually before auto-running.',
      ],
    },
    pageUrl,
    pageTitle
  );
}

module.exports = {
  generateTestSuggestion,
  detectLoginFormSuggestion,
  buildSteps,
  titleForBehavior,
  truncateText,
  createShortSuggestionTitle,
};
