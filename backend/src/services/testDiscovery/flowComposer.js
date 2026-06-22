const { buildSteps, titleForBehavior } = require('./testSuggestionGenerator');
const { findPageByIntent, findBehaviors } = require('./actionGraphBuilder');
const { intentDisplayLabel } = require('./pageIntentClassifier');

function step(action, label, extra = {}) {
  return { action, label, ...extra };
}

function elementTarget(element) {
  if (!element) return {};
  return {
    selector: element.selector,
    selectorAlternatives: element.selectorAlternatives || [],
    elementLabel: element.humanLabel || element.text || 'element',
    targetLabel: element.humanLabel || element.text || 'element',
    targetText: element.text || undefined,
  };
}

function flowBusinessValue(flowType, pagesInvolved = []) {
  const intents = pagesInvolved.map((page) => page.intent).filter(Boolean);
  if (flowType === 'contact-journey') {
    return 'Verifies visitors can reach and use the contact path — a core lead-generation flow.';
  }
  if (flowType === 'product-quick-view') {
    return 'Verifies product discovery interactions work for shoppers browsing items.';
  }
  if (flowType === 'add-to-cart-journey') {
    return 'Verifies shoppers can add items and see cart feedback — critical for ecommerce confidence.';
  }
  if (flowType === 'login-validation-journey') {
    return 'Verifies invalid login attempts show clear feedback without using real credentials.';
  }
  if (flowType === 'dynamic-loading-flow') {
    return 'Verifies delayed content loads correctly after a start/load interaction.';
  }
  if (intents.includes('pricing')) {
    return 'Verifies a conversion-focused path on a pricing-oriented page.';
  }
  return 'Verifies an observed multi-step user journey on this site.';
}

function composeFlowSuggestion(definition) {
  const confidence = definition.confidence || 0.78;
  const suggestion = {
    id: definition.id,
    type: definition.type,
    patternType: definition.type,
    category: 'multi-step-flow',
    title: definition.title,
    description: definition.description,
    flowSummary: definition.flowSummary,
    pagesInvolved: definition.pagesInvolved,
    businessValue: definition.businessValue,
    sourceUrl: definition.sourceUrl,
    sourcePageTitle: definition.sourcePageTitle,
    startUrl: definition.startUrl || definition.sourceUrl,
    primaryLabel: definition.primaryLabel,
    selectorOrLabel: definition.selectorOrLabel,
    safetyLevel: definition.safetyLevel || 'safe',
    confidence,
    confidenceLevel: confidence >= 0.85 ? 'high' : confidence >= 0.7 ? 'medium' : 'low',
    discoveredBehavior: definition.discoveredBehavior,
    detectedBehavior: definition.detectedBehavior,
    generatedSteps: definition.generatedSteps,
    generatedStepsPreview: definition.generatedSteps.filter((s) => s.action !== 'screenshot').map((s) => s.label),
    steps: [...definition.generatedSteps, step('screenshot', 'Capture final screenshot')],
    successConditions: definition.successConditions || [],
    reasoning: definition.whySuggested || [],
    discoveryReasons: definition.whySuggested || [],
    whySuggested: definition.whySuggested || [],
    reliabilityScore: definition.reliabilityScore || Math.round(confidence * 100),
    generatedBy: 'flow-composer',
    scenarioType: 'flow',
    isComposedFlow: true,
    visualEvidence: definition.visualEvidence || null,
  };
  return suggestion;
}

function buildContactJourneyFlow(startPage, destinationPage, navBehavior, formBehavior) {
  if (!startPage || !destinationPage || !navBehavior) return null;
  const destPath = destinationPage.path || '/';
  const steps = [
    step('goto', `Open ${startPage.path || 'start page'}`, { url: startPage.url }),
    step('click', `Click ${navBehavior.action.humanLabel}`, elementTarget(navBehavior.action.element)),
    step('expectUrlContains', 'Confirm navigation to contact page', { value: destPath.replace(/^\//, '') || 'contact' }),
  ];
  if (formBehavior?.action?.element) {
    steps.push(
      step('expectVisible', 'Expect contact form visible', elementTarget(formBehavior.action.element))
    );
  } else {
    steps.push(step('expectVisible', 'Expect contact page content', { selector: 'form, textarea, input[type="email"]' }));
  }
  return composeFlowSuggestion({
    id: `contact-journey-${startPage.url}-${destinationPage.url}`,
    type: 'contact-journey',
    title: 'Contact journey test',
    description: `Navigate from ${startPage.path || '/'} to ${destinationPage.path} and verify contact content is available.`,
    flowSummary: 'Home/landing CTA → contact page → form visible',
    pagesInvolved: [startPage, destinationPage],
    businessValue: flowBusinessValue('contact-journey', [startPage, destinationPage]),
    sourceUrl: startPage.url,
    sourcePageTitle: startPage.title,
    startUrl: startPage.url,
    primaryLabel: navBehavior.action.humanLabel,
    selectorOrLabel: navBehavior.action.element?.selector,
    safetyLevel: 'safe',
    confidence: 0.86,
    discoveredBehavior: { summary: 'Observed navigation toward a contact page.', type: 'contact-journey' },
    detectedBehavior: { type: 'contact-journey', description: 'Multi-step contact path discovered.' },
    generatedSteps: steps,
    whySuggested: [
      `Start page intent: ${intentDisplayLabel(startPage.intent)}.`,
      `Destination page intent: ${intentDisplayLabel(destinationPage.intent)}.`,
      'Navigation behavior was observed between these pages.',
    ],
    visualEvidence: navBehavior.visualEvidence || formBehavior?.visualEvidence || null,
  });
}

function buildProductQuickViewFlow(page, hoverBehavior, clickBehavior) {
  if (!page || !hoverBehavior) return null;
  const steps = [
    step('goto', 'Open page', { url: page.url }),
    step('hover', `Hover ${hoverBehavior.action.humanLabel}`, elementTarget(hoverBehavior.action.element)),
    step('expectVisible', 'Expect revealed content visible', elementTarget(hoverBehavior.revealedElement || hoverBehavior.action.element)),
  ];
  if (clickBehavior?.action?.element) {
    steps.push(
      step('click', `Click ${clickBehavior.action.humanLabel}`, elementTarget(clickBehavior.action.element))
    );
    if (clickBehavior.modalElement || clickBehavior.type === 'modal-open-close') {
      steps.push(step('expectVisible', 'Expect modal visible', elementTarget(clickBehavior.modalElement || clickBehavior.action.element)));
    }
  }
  return composeFlowSuggestion({
    id: `product-quick-view-${page.url}-${hoverBehavior.action.element?.signature}`,
    type: 'product-quick-view-flow',
    title: 'Product quick view flow',
    description: 'Hover reveals extra actions or details, then optional click opens quick view/modal.',
    flowSummary: 'Hover card → revealed content → optional quick action',
    pagesInvolved: [page],
    businessValue: flowBusinessValue('product-quick-view', [page]),
    sourceUrl: page.url,
    sourcePageTitle: page.title,
    startUrl: page.url,
    primaryLabel: hoverBehavior.action.humanLabel,
    selectorOrLabel: hoverBehavior.action.element?.selector,
    confidence: clickBehavior ? 0.84 : 0.8,
    discoveredBehavior: { summary: hoverBehavior.summary, type: 'product-quick-view-flow' },
    detectedBehavior: { type: 'product-quick-view-flow', description: hoverBehavior.summary },
    generatedSteps: steps,
    whySuggested: [
      'Hover revealed additional content on a product-like page.',
      clickBehavior ? 'Follow-up click behavior was also observed.' : 'Only hover reveal was confirmed safely.',
    ],
    visualEvidence: hoverBehavior.visualEvidence || clickBehavior?.visualEvidence || null,
  });
}

function buildDynamicLoadingFlow(page, behavior) {
  if (!behavior) return null;
  const baseSteps = buildSteps(behavior, page.url);
  return composeFlowSuggestion({
    id: `dynamic-loading-flow-${page.url}-${behavior.action.element?.signature}`,
    type: 'dynamic-loading-flow',
    title: titleForBehavior({ ...behavior, type: 'dynamic-loading' }),
    description: behavior.summary,
    flowSummary: 'Click start/load → wait → final content visible',
    pagesInvolved: [page],
    businessValue: flowBusinessValue('dynamic-loading-flow', [page]),
    sourceUrl: page.url,
    sourcePageTitle: page.title,
    startUrl: page.url,
    primaryLabel: behavior.action.humanLabel,
    selectorOrLabel: behavior.action.element?.selector,
    safetyLevel: behavior.safety?.safetyLevel || 'safe',
    confidence: behavior.confidence || 0.82,
    discoveredBehavior: { summary: behavior.summary, type: 'dynamic-loading' },
    detectedBehavior: { type: 'dynamic-loading', description: behavior.summary },
    generatedSteps: baseSteps.filter((entry) => entry.action !== 'screenshot'),
    whySuggested: behavior.reasoning || [],
    visualEvidence: behavior.visualEvidence || null,
  });
}

function buildLoginValidationFlow(page, behavior) {
  if (!behavior || behavior.type !== 'login-error') return null;
  const baseSteps = buildSteps(behavior, page.url);
  return composeFlowSuggestion({
    id: `login-validation-flow-${page.url}`,
    type: 'login-validation-flow',
    title: 'Invalid login validation test',
    description: behavior.summary,
    flowSummary: 'Fill dummy credentials → submit → expect error message',
    pagesInvolved: [page],
    businessValue: flowBusinessValue('login-validation-journey', [page]),
    sourceUrl: page.url,
    sourcePageTitle: page.title,
    startUrl: page.url,
    primaryLabel: 'login',
    selectorOrLabel: behavior.submitSelector,
    safetyLevel: 'requires-confirmation',
    confidence: behavior.confidence || 0.74,
    discoveredBehavior: { summary: behavior.summary, type: 'login-error' },
    detectedBehavior: { type: 'login-error', description: behavior.summary },
    generatedSteps: baseSteps.filter((entry) => entry.action !== 'screenshot'),
    whySuggested: behavior.reasoning || [],
  });
}

function composeFlowSuggestions(context = {}) {
  const { siteMap = [], behaviors = [], existingSuggestions = [] } = context;
  const composed = [];
  const seen = new Set(existingSuggestions.map((s) => `${s.type}|${s.sourceUrl}|${s.title}`));

  const contactPages = findPageByIntent(siteMap, ['contact', 'lead-generation']);
  const navBehaviors = findBehaviors(behaviors, (b) => b.type === 'navigation');
  for (const nav of navBehaviors) {
    const destination = siteMap.find((page) => page.url === nav.destinationUrl);
    if (!destination || !contactPages.some((page) => page.url === destination.url)) continue;
    const startPage = siteMap.find((page) => page.url === nav.sourceUrl);
    const formBehavior = behaviors.find(
      (b) => b.sourceUrl === destination.url && ['form-validation', 'contact-form-like'].includes(b.type)
    );
    const flow = buildContactJourneyFlow(startPage, destination, nav, formBehavior);
    if (flow && !seen.has(`${flow.type}|${flow.sourceUrl}|${flow.title}`)) {
      composed.push(flow);
      seen.add(`${flow.type}|${flow.sourceUrl}|${flow.title}`);
    }
  }

  for (const page of siteMap.filter((p) => ['product', 'ecommerce', 'demo-interactive'].includes(p.intent))) {
    const hovers = behaviors.filter((b) => b.sourceUrl === page.url && b.type === 'hover-reveal');
    for (const hover of hovers.slice(0, 2)) {
      const clickFollowUp = behaviors.find(
        (b) =>
          b.sourceUrl === page.url &&
          ['modal-open-close', 'dynamic-element-created'].includes(b.type) &&
          b.action?.humanLabel
      );
      const flow = buildProductQuickViewFlow(page, hover, clickFollowUp);
      if (flow && !seen.has(`${flow.type}|${flow.sourceUrl}|${flow.title}`)) {
        composed.push(flow);
        seen.add(`${flow.type}|${flow.sourceUrl}|${flow.title}`);
      }
    }
  }

  for (const behavior of behaviors.filter((b) => b.type === 'dynamic-loading')) {
    const page = siteMap.find((entry) => entry.url === behavior.sourceUrl);
    if (!page) continue;
    const flow = buildDynamicLoadingFlow(page, behavior);
    if (flow && !seen.has(`${flow.type}|${flow.sourceUrl}|${flow.title}`)) {
      composed.push(flow);
      seen.add(`${flow.type}|${flow.sourceUrl}|${flow.title}`);
    }
  }

  for (const behavior of behaviors.filter((b) => b.type === 'login-error')) {
    const page = siteMap.find((entry) => entry.url === behavior.sourceUrl);
    if (!page) continue;
    const flow = buildLoginValidationFlow(page, behavior);
    if (flow && !seen.has(`${flow.type}|${flow.sourceUrl}|${flow.title}`)) {
      composed.push(flow);
      seen.add(`${flow.type}|${flow.sourceUrl}|${flow.title}`);
    }
  }

  return composed.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

module.exports = {
  composeFlowSuggestions,
  composeFlowSuggestion,
  buildContactJourneyFlow,
  buildProductQuickViewFlow,
  buildDynamicLoadingFlow,
  buildLoginValidationFlow,
};
