const { SCENARIO_TYPES } = require('./constants');
const { normalizeFlowConfig } = require('./flowSteps');
const { runFlow } = require('./flowRunner');
const {
  runContactForm,
  runCtaLink,
  runMobileNav,
  runBrokenLinks,
  runCheckoutSmoke,
} = require('./runners');

const LEGACY_RUNNERS = {
  'contact-form': runContactForm,
  'cta-link': runCtaLink,
  'mobile-nav': runMobileNav,
  'broken-links': runBrokenLinks,
  'checkout-smoke': runCheckoutSmoke,
};

function normalizeConfig(type, config, startUrl = '') {
  const base = config && typeof config === 'object' ? config : {};

  if (type === 'flow') {
    return normalizeFlowConfig(base, startUrl);
  }

  switch (type) {
    case 'contact-form':
      return {
        fields: {
          name: base.fields?.name || { selector: 'input[name="name"], #name', value: 'QA Test User' },
          email: base.fields?.email || {
            selector: 'input[name="email"], #email',
            value: 'qa-test@example.com',
          },
          message: base.fields?.message || {
            selector: 'textarea[name="message"], #message',
            value: 'Automated test message — please ignore.',
          },
        },
        submitSelector: base.submitSelector || 'button[type="submit"], input[type="submit"]',
        success: base.success || { type: 'text', value: 'thank' },
      };
    case 'cta-link':
      return {
        ctaSelector: base.ctaSelector || '',
        ctaText: base.ctaText || '',
        expectedUrlContains: base.expectedUrlContains || '',
        expectedText: base.expectedText || '',
      };
    case 'mobile-nav':
      return {
        menuButtonSelector:
          base.menuButtonSelector || 'button[aria-label*="menu" i], .menu-toggle, .hamburger',
        navLinkSelector: base.navLinkSelector || 'nav a, [role="navigation"] a',
      };
    case 'broken-links':
      return { maxLinks: base.maxLinks || 30 };
    case 'checkout-smoke':
      return {
        addToCartSelector:
          base.addToCartSelector || 'button[name="add-to-cart"], .add-to-cart, [data-testid="add-to-cart"]',
        expectedCartText: base.expectedCartText || '',
        cartCountPattern: base.cartCountPattern || '',
      };
    default:
      return base;
  }
}

async function runScenario(scenario) {
  if (scenario.type === 'flow') {
    const normalized = {
      ...scenario,
      config: normalizeConfig('flow', scenario.config, scenario.startUrl),
    };
    return runFlow(normalized);
  }

  const runner = LEGACY_RUNNERS[scenario.type];
  if (!runner) {
    throw new Error(`Unsupported scenario type: ${scenario.type}`);
  }

  const normalized = {
    ...scenario,
    config: normalizeConfig(scenario.type, scenario.config, scenario.startUrl),
  };

  return runner(normalized);
}

function isValidScenarioType(type) {
  return SCENARIO_TYPES.includes(type);
}

module.exports = {
  runScenario,
  isValidScenarioType,
  normalizeConfig,
  SCENARIO_TYPES,
};
