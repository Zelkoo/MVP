const { toDetectedElement } = require('./extractPageContext');
const { enrichSuggestion } = require('./suggestionMeta');

const CTA_KEYWORDS =
  /\b(get started|contact us|contact|book a call|book|schedule|start now|start|try|learn more|sign up|signup|request demo|demo|buy now|shop now)\b/i;
const NEWSLETTER_KEYWORDS = /\b(subscribe|newsletter|join|sign up|signup|stay updated|get updates)\b/i;
const CART_KEYWORDS = /\b(add to cart|add to basket|add to bag|buy now)\b/i;
const CHECKOUT_KEYWORDS = /\b(checkout|check out|proceed to checkout)\b/i;
const CART_INDICATOR_KEYWORDS = /\b(cart|basket|bag|shopping)\b/i;
const MENU_KEYWORDS = /\b(menu|navigation|nav|toggle)\b/i;
const IMPORTANT_LINK_KEYWORDS =
  /\b(home|about|services|contact|pricing|products|blog|support|help|faq|shop|cart|login|sign in|sign up|privacy|terms)\b/i;

function confidenceLabel(score) {
  if (score >= 0.8) return 'High';
  if (score >= 0.6) return 'Medium';
  return 'Low';
}

function fieldByType(form, type) {
  return form.fields.find((field) => field.fieldType === type)?.detected || null;
}

function successStep(strategies) {
  return {
    type: 'expect-success',
    label: 'Verify submission',
    successStrategies: strategies,
  };
}

function goToStep(url) {
  return { type: 'go-to-url', label: 'Open page', url };
}

function fillStep(label, detected, value) {
  return {
    type: 'fill-input',
    label,
    selector: detected.selector,
    value,
    elementLabel: detected.label,
  };
}

function clickStep(label, detected) {
  return {
    type: 'click-element',
    label,
    selector: detected.selector,
    text: detected.selector.startsWith('text=') ? detected.selector.replace(/^text=/, '') : detected.label,
    elementLabel: detected.label,
  };
}

function buildContactFormSuggestion(form, url) {
  const name = fieldByType(form, 'name');
  const email = fieldByType(form, 'email');
  const message = fieldByType(form, 'message') || fieldByType(form, 'unknown');
  const phone = fieldByType(form, 'phone');
  const submit = form.submit;

  if (!email || !submit) return null;
  if (!name && !message && !phone) return null;

  const detectedElements = [name, email, message, phone, submit].filter(Boolean);
  const generatedSteps = [goToStep(url)];
  if (name) generatedSteps.push(fillStep('Fill name', name, 'Test User'));
  if (email) generatedSteps.push(fillStep('Fill email', email, 'test@example.com'));
  if (phone) generatedSteps.push(fillStep('Fill phone', phone, '555-0100'));
  if (message) generatedSteps.push(fillStep('Fill message', message, 'This is an automated test message.'));
  generatedSteps.push(clickStep('Submit form', submit));
  generatedSteps.push(
    successStep([
      { type: 'page-contains-text', value: 'thank' },
      { type: 'url-changed', value: 'thank' },
      { type: 'network-2xx-after-submit', value: '' },
    ])
  );

  const confidence = Math.min(
    0.95,
    0.55 + detectedElements.length * 0.08 + (name && email && message ? 0.15 : 0)
  );

  return {
    id: `contact-form-${submit.selector}`,
    type: 'contact-form',
    title: 'Contact form test',
    description: `We found a contact form with ${[name && 'name', email && 'email', message && 'message', phone && 'phone'].filter(Boolean).join(', ')} fields.`,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    detectedElements,
    generatedSteps,
  };
}

function buildNewsletterSuggestion(form, url) {
  const email = fieldByType(form, 'email');
  const submit = form.submit;
  if (!email || !submit) return null;

  const combined = `${form.nearbyText} ${submit.label} ${email.label}`.toLowerCase();
  if (!NEWSLETTER_KEYWORDS.test(combined)) return null;
  if (form.fields.length > 2) return null;

  const confidence = 0.78;
  return {
    id: `newsletter-${email.selector}`,
    type: 'newsletter',
    title: 'Newsletter signup test',
    description: 'We found an email signup with a subscribe-style button.',
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    detectedElements: [email, submit],
    generatedSteps: [
      goToStep(url),
      fillStep('Fill email', email, 'test@example.com'),
      clickStep('Click subscribe', submit),
      successStep([
        { type: 'page-contains-text', value: 'subscribed' },
        { type: 'network-2xx-after-submit', value: '' },
      ]),
    ],
  };
}

function scoreCta(item, viewportHeight = 900) {
  const text = `${item.text} ${item.ariaLabel}`.trim();
  if (!text) return 0;
  if (!CTA_KEYWORDS.test(text)) return 0;

  let score = 0.55;
  if (CTA_KEYWORDS.test(text)) score += 0.2;
  if (item.boundingBox?.y < viewportHeight * 0.65) score += 0.12;
  if ((item.boundingBox?.width || 0) >= 120) score += 0.08;
  if (item.tagName === 'button' || item.tagName === 'a') score += 0.05;
  return Math.min(score, 0.92);
}

function buildCtaSuggestions(interactive, url, viewportHeight = 900) {
  const scored = interactive
    .map((item) => ({ item, score: scoreCta(item, viewportHeight) }))
    .filter((entry) => entry.score >= 0.6)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(({ item, score }, index) => {
    const detected = item.detected;
    const hrefPath = item.href ? item.href.replace(/^https?:\/\/[^/]+/i, '') : '';
    return {
      id: `cta-${index}-${detected.selector}`,
      type: 'cta',
      title: 'CTA click test',
      description: `Try clicking "${detected.label}" and confirm the next page loads.`,
      confidence: score,
      confidenceLabel: confidenceLabel(score),
      detectedElements: [detected],
      generatedSteps: [
        goToStep(url),
        clickStep(`Click ${detected.label}`, detected),
        successStep([
          hrefPath && hrefPath !== '#'
            ? { type: 'url-changed', value: hrefPath.replace(/^\//, '') || '/' }
            : { type: 'element-visible', value: detected.selector },
          { type: 'page-contains-text', value: detected.label },
        ]),
      ],
    };
  });
}

function buildAddToCartSuggestion(interactive, url) {
  const button = interactive.find((item) => CART_KEYWORDS.test(`${item.text} ${item.ariaLabel}`.toLowerCase()));
  if (!button) return null;

  const cartIndicator = interactive.find((item) => {
    const text = `${item.text} ${item.ariaLabel} ${item.placeholder}`.toLowerCase();
    return CART_INDICATOR_KEYWORDS.test(text) && item !== button;
  });

  const detected = button.detected;
  const confidence = 0.84;
  const successStrategies = cartIndicator
    ? [{ type: 'element-visible', value: cartIndicator.detected.selector, elementLabel: cartIndicator.detected.label }]
    : [
        { type: 'page-contains-text', value: 'cart' },
        { type: 'url-changed', value: 'cart' },
      ];

  return {
    id: `add-to-cart-${detected.selector}`,
    type: 'add-to-cart',
    title: 'Add to cart test',
    description: `We found an "${detected.label}" button that looks like add-to-cart.`,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    detectedElements: cartIndicator ? [detected, cartIndicator.detected] : [detected],
    generatedSteps: [goToStep(url), clickStep('Click add to cart', detected), successStep(successStrategies)],
  };
}

function buildCheckoutSuggestion(interactive, url) {
  const button = interactive.find((item) =>
    CHECKOUT_KEYWORDS.test(`${item.text} ${item.ariaLabel}`.toLowerCase())
  );
  if (!button) return null;

  const detected = button.detected;
  return {
    id: `checkout-${detected.selector}`,
    type: 'checkout-start',
    title: 'Checkout start test',
    description: `We found a checkout button: "${detected.label}".`,
    confidence: 0.8,
    confidenceLabel: confidenceLabel(0.8),
    detectedElements: [detected],
    generatedSteps: [
      goToStep(url),
      clickStep('Click checkout', detected),
      successStep([{ type: 'url-changed', value: 'checkout' }, { type: 'page-contains-text', value: 'checkout' }]),
    ],
  };
}

function looksLikeMobileMenuToggle(item) {
  const text = `${item.text} ${item.ariaLabel} ${item.stableClasses?.join(' ')}`.toLowerCase();
  if (/context menu|right.?click|dropdown menu item/.test(text)) return false;

  const isButtonLike = item.tagName === 'button' || item.ariaRole === 'button';
  if (!isButtonLike && !/hamburger|menu-toggle|nav-toggle|mobile-menu|navbar-toggler/.test(text)) {
    return false;
  }

  if (/hamburger|menu-toggle|nav-toggle|mobile-menu|navbar-toggler/.test(text)) return true;
  if (/\b(open menu|main menu|mobile nav|navigation menu|menu button)\b/.test(text)) return true;

  if (isButtonLike && MENU_KEYWORDS.test(text) && !/context/.test(text)) return true;
  return false;
}

function buildMobileMenuSuggestion(interactive, url) {
  const menuButton = interactive.find((item) => looksLikeMobileMenuToggle(item));
  if (!menuButton) return null;

  const nav = interactive.find((item) => {
    if (item === menuButton) return false;
    const text = `${item.text} ${item.ariaLabel}`.toLowerCase();
    if (item.tagName === 'nav') return true;
    return item.tagName === 'a' && /home|about|services|contact|pricing|products|blog|support/.test(text);
  });

  const detected = menuButton.detected;
  const confidence = 0.76;
  return {
    id: `mobile-menu-${detected.selector}`,
    type: 'mobile-menu',
    title: 'Mobile menu test',
    description: 'We found a mobile menu button. This test runs in a mobile viewport.',
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    detectedElements: nav ? [detected, nav.detected] : [detected],
    generatedSteps: [
      goToStep(url),
      clickStep('Open menu', detected),
      successStep(
        nav
          ? [{ type: 'element-visible', value: nav.detected.selector, elementLabel: nav.detected.label }]
          : [{ type: 'page-contains-text', value: 'menu' }]
      ),
    ],
    viewport: 'mobile',
  };
}

function buildBrokenLinksSuggestion(interactive, url) {
  const links = interactive.filter(
    (item) => item.tagName === 'a' && item.href && item.href !== '#' && !item.href.startsWith('javascript:')
  );
  if (links.length < 4) return null;

  const important = links.filter((item) => {
    const text = `${item.text} ${item.ariaLabel} ${item.href}`.toLowerCase();
    const classHint = (item.stableClasses || []).join(' ').toLowerCase();
    return IMPORTANT_LINK_KEYWORDS.test(text) || /nav|header|footer|menu/.test(classHint);
  });

  if (important.length < 2 && links.length < 8) return null;

  const sampled = (important.length >= 2 ? important : links).slice(0, 6);
  const confidence = important.length >= 3 ? 0.82 : 0.68;

  return {
    id: `broken-links-${url.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`,
    type: 'broken-links',
    title: 'Broken important links test',
    description: `We found ${links.length} links on the page and will sample important navigation destinations for dead ends.`,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    detectedElements: sampled.map((item) => item.detected),
    generatedSteps: [
      goToStep(url),
      { type: 'check-links', label: 'Check important links', linkCount: Math.min(links.length, 25) },
      successStep([{ type: 'no-broken-links', value: '' }]),
    ],
    scenarioType: 'broken-links',
  };
}

function buildSuggestions({ forms, interactive, url, viewportHeight, mobileInteractive = null }) {
  const suggestions = [];
  const usedTypes = new Set();

  for (const form of forms) {
    const contact = buildContactFormSuggestion(form, url);
    if (contact && !usedTypes.has('contact-form')) {
      suggestions.push(contact);
      usedTypes.add('contact-form');
    }

    const newsletter = buildNewsletterSuggestion(form, url);
    if (newsletter && !usedTypes.has('newsletter')) {
      suggestions.push(newsletter);
      usedTypes.add('newsletter');
    }
  }

  const addToCart = buildAddToCartSuggestion(interactive, url);
  if (addToCart) suggestions.push(addToCart);

  const checkout = buildCheckoutSuggestion(interactive, url);
  if (checkout) suggestions.push(checkout);

  suggestions.push(...buildCtaSuggestions(interactive, url, viewportHeight));

  if (mobileInteractive) {
    const mobileMenu = buildMobileMenuSuggestion(mobileInteractive, url);
    if (mobileMenu) suggestions.push(mobileMenu);
  }

  const brokenLinks = buildBrokenLinksSuggestion(interactive, url);
  if (brokenLinks && !usedTypes.has('broken-links')) {
    suggestions.push(brokenLinks);
    usedTypes.add('broken-links');
  }

  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map(enrichSuggestion);
}

module.exports = {
  buildSuggestions,
  confidenceLabel,
};
