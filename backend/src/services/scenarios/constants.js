const SCENARIO_TYPES = [
  'flow',
  'contact-form',
  'cta-link',
  'mobile-nav',
  'broken-links',
  'checkout-smoke',
];

const SCENARIO_LABELS = {
  flow: 'Custom flow',
  'contact-form': 'Contact form test',
  'cta-link': 'CTA link test',
  'mobile-nav': 'Mobile navigation test',
  'broken-links': 'Broken links test',
  'checkout-smoke': 'Basic checkout smoke test',
};

const NAVIGATION_TIMEOUT_MS = 20000;
const SCENARIO_TIMEOUT_MS = 60000;
const DEFAULT_BROKEN_LINK_LIMIT = 30;

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

module.exports = {
  SCENARIO_TYPES,
  SCENARIO_LABELS,
  NAVIGATION_TIMEOUT_MS,
  SCENARIO_TIMEOUT_MS,
  DEFAULT_BROKEN_LINK_LIMIT,
  MOBILE_VIEWPORT,
  DESKTOP_VIEWPORT,
};
