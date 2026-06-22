const CTA_KEYWORDS =
  /\b(get started|start now|start|try free|try now|contact us|contact|book a call|book|schedule|request demo|demo|sign up|signup|learn more|buy now|shop now|join now)\b/i;
const SECONDARY_CTA_KEYWORDS = /\b(read more|see more|view all|details|download|register|log in|login|sign in)\b/i;
const SUBMIT_KEYWORDS = /\b(submit|send|contact|apply|request|subscribe|sign up|signup|join)\b/i;
const NAV_KEYWORDS = /\b(home|about|services|contact|pricing|products|blog|support|help|faq|shop|cart|login|sign in|privacy|terms)\b/i;
const MENU_KEYWORDS = /\b(menu|navigation|nav|toggle|hamburger)\b/i;
const CART_KEYWORDS = /\b(add to cart|add to basket|add to bag|buy now)\b/i;
const CHECKOUT_KEYWORDS = /\b(checkout|check out|proceed to checkout|pay now)\b/i;
const NEWSLETTER_KEYWORDS = /\b(subscribe|newsletter|join|sign up|signup|stay updated|get updates)\b/i;
const EMAIL_KEYWORDS = /\b(email|e-mail)\b/i;
const NAME_KEYWORDS = /\b(name|full name|first name|last name|fname|lname)\b/i;
const MESSAGE_KEYWORDS = /\b(message|comment|notes|inquiry|question|feedback|body)\b/i;

const CATEGORY_MEANINGS = {
  'primary-cta': 'This looks like the main conversion button on the page.',
  'secondary-cta': 'This is a supporting action that may lead to another page or step.',
  'submit-button': 'This button likely submits a form or sends information.',
  'form-input': 'This field collects information as part of a form.',
  'email-input': 'This field is likely used for signup or contact forms.',
  'name-input': 'This field collects a person’s name for forms or signup.',
  'message-input': 'This field is for longer messages such as contact or support requests.',
  'navigation-link': 'This link helps visitors move around the site.',
  'mobile-menu-button': 'This opens navigation on smaller screens.',
  'add-to-cart': 'This button adds a product to the shopping cart.',
  checkout: 'This starts or continues the checkout process.',
  newsletter: 'This is part of an email signup or newsletter form.',
  unknown: 'This element may be interactive, but its purpose is unclear.',
};

const CATEGORY_ACTIONS = {
  'primary-cta': ['click', 'verify-navigation'],
  'secondary-cta': ['click', 'verify-navigation'],
  'submit-button': ['click', 'verify-success'],
  'form-input': ['fill-input'],
  'email-input': ['fill-input'],
  'name-input': ['fill-input'],
  'message-input': ['fill-input'],
  'navigation-link': ['click', 'verify-navigation'],
  'mobile-menu-button': ['click', 'verify-navigation'],
  'add-to-cart': ['click', 'verify-cart'],
  checkout: ['click', 'verify-navigation'],
  newsletter: ['fill-input', 'click'],
  unknown: ['click', 'expect-visible'],
};

function combinedHints(raw) {
  return [
    raw.text,
    raw.ariaLabel,
    raw.placeholder,
    raw.name,
    raw.id,
    raw.type,
    raw.href,
    raw.role,
    ...(raw.stableClasses || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isAboveFold(boundingBox, viewportHeight = 900) {
  if (!boundingBox) return false;
  return boundingBox.y < viewportHeight * 0.65;
}

function isProminent(boundingBox) {
  if (!boundingBox) return false;
  return boundingBox.width >= 120 && boundingBox.height >= 32;
}

function cleanDisplayText(raw) {
  let text = (raw.text || raw.ariaLabel || raw.placeholder || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';

  text = text.replace(/^(info|icon|image|img|logo|menu|link|home)\s+/i, '');
  text = text.replace(/\s+(link|button|menu|field|input)$/i, '').trim();

  if (text.length > 3 && text === text.toUpperCase()) {
    text = text
      .toLowerCase()
      .split(' ')
      .map((word) => {
        if (/^[a-z0-9]{2,5}$/i.test(word) && word === word.toUpperCase()) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  const words = text.split(' ');
  const deduped = words.filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase());
  return deduped.join(' ').slice(0, 48).trim();
}

function buildHumanLabel(category, raw, label) {
  const text = cleanDisplayText(raw) || cleanDisplayText({ text: label }) || '';
  switch (category) {
    case 'primary-cta':
      return text || 'Primary action';
    case 'secondary-cta':
      return text || 'Secondary action';
    case 'submit-button':
      return text || 'Submit';
    case 'email-input':
      return 'Email';
    case 'name-input':
      return 'Name';
    case 'message-input':
      return 'Message';
    case 'form-input':
      return text || 'Form field';
    case 'navigation-link':
      return text || 'Navigation link';
    case 'mobile-menu-button':
      return text || 'Menu';
    case 'add-to-cart':
      return text || 'Add to cart';
    case 'checkout':
      return text || 'Checkout';
    case 'newsletter':
      return text || 'Newsletter signup';
    default:
      return text || 'Interactive element';
  }
}

function buildExplanation(category, raw, viewportHeight) {
  const text = cleanDisplayText(raw);
  const aboveFold = isAboveFold(raw.boundingBox, viewportHeight);
  const prominent = isProminent(raw.boundingBox);

  switch (category) {
    case 'primary-cta':
      return `This looks like the main CTA because it is ${prominent ? 'large' : 'visible'}${aboveFold ? ', above the fold' : ''}${text ? `, and says "${text.slice(0, 40)}"` : ''}.`;
    case 'secondary-cta':
      return `This looks like a secondary action${text ? ` with label "${text.slice(0, 40)}"` : ''}.`;
    case 'submit-button':
      return `This looks like a submit button${text ? ` labeled "${text.slice(0, 40)}"` : ''} for sending a form.`;
    case 'email-input':
      return 'This looks like an email field based on its label, placeholder, or input type.';
    case 'name-input':
      return 'This looks like a name field based on its label or placeholder.';
    case 'message-input':
      return 'This looks like a message field because it accepts longer text.';
    case 'form-input':
      return 'This looks like a form field used to collect visitor information.';
    case 'navigation-link':
      return `This looks like a navigation link${text ? ` to "${text.slice(0, 40)}"` : ''}.`;
    case 'mobile-menu-button':
      return 'This looks like a mobile menu toggle based on its label or icon wording.';
    case 'add-to-cart':
      return `This looks like an add-to-cart button${text ? `: "${text.slice(0, 40)}"` : ''}.`;
    case 'checkout':
      return `This looks like a checkout action${text ? `: "${text.slice(0, 40)}"` : ''}.`;
    case 'newsletter':
      return 'This looks like part of a newsletter or email signup area.';
    default:
      return 'We detected this element as interactive, but its business purpose is unclear.';
  }
}

function classifyCategory(raw, viewportHeight = 900) {
  const tag = (raw.tagName || '').toLowerCase();
  const type = (raw.type || '').toLowerCase();
  const hints = combinedHints(raw);
  const text = `${raw.text || ''} ${raw.ariaLabel || ''}`.trim();

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (type === 'email' || EMAIL_KEYWORDS.test(hints)) return 'email-input';
    if (tag === 'textarea' || MESSAGE_KEYWORDS.test(hints)) return 'message-input';
    if (NAME_KEYWORDS.test(hints)) return 'name-input';
    if (NEWSLETTER_KEYWORDS.test(hints) && type === 'email') return 'newsletter';
    return 'form-input';
  }

  if (CART_KEYWORDS.test(hints)) return 'add-to-cart';
  if (CHECKOUT_KEYWORDS.test(hints)) return 'checkout';

  if (
    (tag === 'button' || raw.role === 'button') &&
    !/context menu/.test(hints) &&
    (MENU_KEYWORDS.test(hints) || /hamburger|menu-toggle|nav-toggle|mobile-menu/.test(hints))
  ) {
    return 'mobile-menu-button';
  }

  if ((tag === 'button' || type === 'submit') && SUBMIT_KEYWORDS.test(hints)) {
    return 'submit-button';
  }

  if (tag === 'a' || raw.role === 'link') {
    if (NAV_KEYWORDS.test(hints) || /nav|header|footer|menu/.test(hints)) {
      return 'navigation-link';
    }
  }

  if (CTA_KEYWORDS.test(text) || CTA_KEYWORDS.test(hints)) {
    if (isAboveFold(raw.boundingBox, viewportHeight) && isProminent(raw.boundingBox)) {
      return 'primary-cta';
    }
    return 'secondary-cta';
  }

  if (SECONDARY_CTA_KEYWORDS.test(text) || SECONDARY_CTA_KEYWORDS.test(hints)) {
    return 'secondary-cta';
  }

  if (tag === 'button' || raw.role === 'button') {
    if (SUBMIT_KEYWORDS.test(hints)) return 'submit-button';
    if (isAboveFold(raw.boundingBox, viewportHeight) && isProminent(raw.boundingBox)) {
      return 'secondary-cta';
    }
  }

  if (tag === 'a') return 'navigation-link';
  if (NEWSLETTER_KEYWORDS.test(hints)) return 'newsletter';

  return 'unknown';
}

function classifyImportance(category, raw, viewportHeight = 900) {
  const highCategories = new Set([
    'primary-cta',
    'submit-button',
    'add-to-cart',
    'checkout',
    'email-input',
    'mobile-menu-button',
  ]);
  const mediumCategories = new Set([
    'secondary-cta',
    'name-input',
    'message-input',
    'navigation-link',
    'newsletter',
    'form-input',
  ]);

  if (highCategories.has(category)) {
    if (category === 'mobile-menu-button' && viewportHeight > 700) return 'medium';
    return 'high';
  }
  if (mediumCategories.has(category)) return 'medium';
  if (category === 'unknown') return 'low';
  return 'low';
}

function importanceRank(importance) {
  if (importance === 'high') return 3;
  if (importance === 'medium') return 2;
  return 1;
}

function classifyElement(raw, context = {}) {
  const viewportHeight = context.viewportHeight || 900;
  const label = context.label || raw.text || raw.ariaLabel || 'Element';
  const category = classifyCategory(raw, viewportHeight);
  const importance = classifyImportance(category, raw, viewportHeight);

  return {
    category,
    importance,
    humanLabel: buildHumanLabel(category, raw, label),
    businessMeaning: CATEGORY_MEANINGS[category] || CATEGORY_MEANINGS.unknown,
    suggestedActions: CATEGORY_ACTIONS[category] || CATEGORY_ACTIONS.unknown,
    explanation: buildExplanation(category, raw, viewportHeight),
    importanceRank: importanceRank(importance),
  };
}

module.exports = {
  classifyElement,
  importanceRank,
  CATEGORY_MEANINGS,
};
