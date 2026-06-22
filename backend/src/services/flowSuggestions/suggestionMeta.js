function confidenceLevel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

function describeSuccessStrategy(strategy) {
  switch (strategy.type) {
    case 'page-contains-text':
      return `The page should show text like "${strategy.value || 'thank you'}"`;
    case 'url-changed':
      return `The URL should change to include "${strategy.value || 'success'}"`;
    case 'network-2xx-after-submit':
      return 'The server should respond successfully after submit';
    case 'element-visible':
      return `${strategy.elementLabel || 'The expected element'} should appear on the page`;
    case 'no-broken-links':
      return 'Important links should load without errors';
    default:
      return 'The action should complete successfully';
  }
}

function buildSuccessConditions(generatedSteps) {
  const expectStep = generatedSteps.find((step) => step.type === 'expect-success');
  const strategies = expectStep?.successStrategies || [];
  return strategies.map((strategy, index) => ({
    type: strategy.type,
    label:
      strategy.type === 'page-contains-text'
        ? 'Success message appears'
        : strategy.type === 'url-changed'
          ? 'Page navigates away'
          : strategy.type === 'network-2xx-after-submit'
            ? 'Server accepts submission'
            : strategy.type === 'element-visible'
              ? 'Expected element shows up'
              : strategy.type === 'no-broken-links'
                ? 'No broken links found'
                : 'Test passes',
    description: describeSuccessStrategy(strategy),
    value: strategy.value || undefined,
    elementLabel: strategy.elementLabel || undefined,
    primary: index === 0,
  }));
}

function estimatedReliability(confidence, type) {
  if (confidence >= 0.85) {
    return type === 'broken-links' ? 'Usually reliable for navigation links' : 'Usually reliable';
  }
  if (confidence >= 0.7) {
    return 'Good starting point — confirm elements if the site is heavily customized';
  }
  if (confidence >= 0.6) {
    return 'May need a quick review before trusting results';
  }
  return 'Best used as a draft — manual review recommended';
}

function buildSuggestedReasons(suggestion) {
  const reasons = [];
  const elementCount = suggestion.detectedElements?.length || 0;

  switch (suggestion.type) {
    case 'contact-form':
      reasons.push('Found a form with email and a submit button');
      if (suggestion.detectedElements.some((el) => /name/i.test(el.label))) {
        reasons.push('Detected a name field typical of contact forms');
      }
      if (suggestion.detectedElements.some((el) => /message|comment/i.test(el.label))) {
        reasons.push('Detected a message or comment field');
      }
      break;
    case 'newsletter':
      reasons.push('Found a short email signup form');
      reasons.push('Subscribe-style wording near the form');
      break;
    case 'cta':
      reasons.push('Found a prominent call-to-action button or link');
      if (elementCount) reasons.push(`CTA label: "${suggestion.detectedElements[0]?.label}"`);
      break;
    case 'add-to-cart':
      reasons.push('Found an add-to-cart style button');
      if (elementCount > 1) reasons.push('Also found cart-related elements on the page');
      break;
    case 'checkout-start':
      reasons.push('Found a checkout or proceed button');
      break;
    case 'mobile-menu':
      reasons.push('Found a mobile menu toggle control');
      if (elementCount > 1) reasons.push('Navigation links appear after opening the menu');
      break;
    case 'broken-links':
      reasons.push('Found multiple links worth checking');
      reasons.push('Includes navigation or footer-style destinations');
      break;
    default:
      if (elementCount) reasons.push(`Detected ${elementCount} related element(s) on the page`);
  }

  if (suggestion.confidence >= 0.8) {
    reasons.push('Strong pattern match on this page');
  } else if (suggestion.confidence >= 0.6) {
    reasons.push('Partial pattern match — worth validating once');
  }

  return reasons.slice(0, 4);
}

const BUSINESS_VALUE = {
  'contact-form': 'This verifies that visitors can send leads or support requests.',
  newsletter: 'This verifies that people can join your mailing list.',
  cta: 'This verifies that your main call-to-action works for visitors.',
  'add-to-cart': 'This verifies that shoppers can add products to their cart.',
  'checkout-start': 'This verifies that shoppers can begin checkout (no payment is completed).',
  'mobile-menu': 'This verifies that mobile visitors can open navigation.',
  'broken-links': 'This catches dead-end links before customers hit them.',
};

function enrichSuggestion(suggestion) {
  const level = confidenceLevel(suggestion.confidence);
  return {
    ...suggestion,
    confidenceLevel: level,
    confidenceLabel: suggestion.confidenceLabel || level.charAt(0).toUpperCase() + level.slice(1),
    businessValue: suggestion.businessValue || BUSINESS_VALUE[suggestion.type] || 'This checks an important user journey.',
    suggestedReasons: suggestion.suggestedReasons || buildSuggestedReasons(suggestion),
    estimatedReliability:
      suggestion.estimatedReliability || estimatedReliability(suggestion.confidence, suggestion.type),
    successConditions: suggestion.successConditions || buildSuccessConditions(suggestion.generatedSteps),
  };
}

module.exports = {
  enrichSuggestion,
  confidenceLevel,
  buildSuccessConditions,
  estimatedReliability,
  buildSuggestedReasons,
};
