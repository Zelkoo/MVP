const INTENT_DEFINITIONS = [
  {
    intent: 'homepage',
    pathPatterns: /^\/$|^\/index|^\/home$/i,
    keywords: /\b(home|welcome|get started|learn more)\b/i,
    weight: 0.35,
  },
  {
    intent: 'contact',
    pathPatterns: /contact|support|reach|message|inquiry/i,
    keywords: /\b(contact|message us|send message|get in touch|email us|support)\b/i,
    formSignals: ['email', 'message', 'textarea'],
    weight: 0.9,
  },
  {
    intent: 'lead-generation',
    pathPatterns: /quote|consult|demo-request|book-a-demo|get-quote|lead/i,
    keywords: /\b(quote|consultation|request demo|book a demo|get quote|talk to sales)\b/i,
    weight: 0.85,
  },
  {
    intent: 'login',
    pathPatterns: /login|signin|sign-in|auth/i,
    keywords: /\b(log in|login|sign in|username|password)\b/i,
    requiresPassword: true,
    weight: 0.95,
  },
  {
    intent: 'signup',
    pathPatterns: /signup|sign-up|register|create-account/i,
    keywords: /\b(sign up|signup|register|create account|join)\b/i,
    weight: 0.9,
  },
  {
    intent: 'cart',
    pathPatterns: /cart|basket|bag/i,
    keywords: /\b(cart|basket|bag|checkout items)\b/i,
    weight: 0.9,
  },
  {
    intent: 'checkout-start',
    pathPatterns: /checkout|payment|billing/i,
    keywords: /\b(checkout|pay now|billing|shipping)\b/i,
    weight: 0.85,
  },
  {
    intent: 'product',
    pathPatterns: /product|item|shop|store|catalog|category/i,
    keywords: /\b(product|add to cart|buy now|shop|catalog|sku)\b/i,
    weight: 0.8,
  },
  {
    intent: 'ecommerce',
    pathPatterns: /shop|store|catalog|products/i,
    keywords: /\b(shop|store|catalog|collection|price|add to cart)\b/i,
    weight: 0.75,
  },
  {
    intent: 'pricing',
    pathPatterns: /pricing|plans|subscribe|subscription/i,
    keywords: /\b(pricing|plans|per month|subscription|tier|free trial)\b/i,
    weight: 0.9,
  },
  {
    intent: 'booking',
    pathPatterns: /book|appointment|schedule|reservation/i,
    keywords: /\b(book|appointment|schedule|reserve|calendar)\b/i,
    weight: 0.85,
  },
  {
    intent: 'search',
    pathPatterns: /search|find|results/i,
    keywords: /\b(search|find|results for|query)\b/i,
    hasSearchInput: true,
    weight: 0.8,
  },
  {
    intent: 'dashboard',
    pathPatterns: /dashboard|account|profile|settings|admin/i,
    keywords: /\b(dashboard|account|profile|settings|overview)\b/i,
    weight: 0.75,
  },
  {
    intent: 'documentation',
    pathPatterns: /docs|documentation|guide|help-center|api/i,
    keywords: /\b(documentation|docs|guide|reference|api)\b/i,
    weight: 0.7,
  },
  {
    intent: 'content/article',
    pathPatterns: /blog|news|article|post|story/i,
    keywords: /\b(blog|article|posted|published|read more)\b/i,
    weight: 0.65,
  },
  {
    intent: 'demo-interactive',
    pathPatterns: /demo|example|sample|playground|try|interactive/i,
    keywords: /\b(demo|example|try it|interactive|playground|sample)\b/i,
    weight: 0.7,
  },
];

function pagePathFromUrl(pageUrl) {
  try {
    return new URL(pageUrl).pathname || '/';
  } catch {
    return '/';
  }
}

function confidenceLabel(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function importanceForIntent(intent, score) {
  const highValue = new Set([
    'contact',
    'lead-generation',
    'login',
    'signup',
    'product',
    'ecommerce',
    'cart',
    'checkout-start',
    'pricing',
    'booking',
    'search',
  ]);
  if (highValue.has(intent) && score >= 0.55) return 'high';
  if (score >= 0.7) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function classifyPageIntent(pageState, pageUrl, options = {}) {
  const path = pagePathFromUrl(pageUrl);
  const title = pageState?.title || '';
  const bodySample = pageState?.visibleTextSample || '';
  const headings = (pageState?.headings || []).join(' ');
  const corpus = `${path} ${title} ${headings} ${bodySample}`.toLowerCase();
  const elements = pageState?.elements || [];
  const forms = pageState?.forms || [];

  const hasPassword = elements.some((el) => el.type === 'password');
  const hasEmail = elements.some((el) => el.type === 'email' || /email/i.test(`${el.name} ${el.placeholder}`));
  const hasMessage = elements.some((el) => el.tagName === 'textarea' || /message|comment/i.test(`${el.name} ${el.placeholder}`));
  const hasSearch = elements.some((el) => el.type === 'search' || /search/i.test(`${el.name} ${el.placeholder} ${el.associatedLabel}`));
  const hasCartLanguage = /\b(cart|checkout|add to cart|buy now)\b/i.test(corpus);

  const customKeywords = (options.importantKeywords || []).filter(Boolean);
  let best = { intent: 'unknown', score: 0.2, reasons: ['No strong page intent signals detected.'] };

  for (const def of INTENT_DEFINITIONS) {
    let score = 0;
    const reasons = [];

    if (def.pathPatterns?.test(path)) {
      score += def.weight * 0.45;
      reasons.push(`URL path suggests ${def.intent.replace(/-/g, ' ')}.`);
    }
    if (def.keywords?.test(corpus)) {
      score += def.weight * 0.35;
      reasons.push(`Visible text or headings match ${def.intent.replace(/-/g, ' ')} patterns.`);
    }
    if (def.requiresPassword && hasPassword) {
      score += 0.35;
      reasons.push('Page contains a password field.');
    }
    if (def.intent === 'contact' && hasEmail && hasMessage) {
      score += 0.35;
      reasons.push('Page contains email and message fields.');
    }
    if (def.hasSearchInput && hasSearch) {
      score += 0.25;
      reasons.push('Page contains a search input.');
    }
    if ((def.intent === 'product' || def.intent === 'ecommerce') && hasCartLanguage) {
      score += 0.2;
      reasons.push('Page mentions cart or purchase actions.');
    }
    if (forms.length > 0 && ['contact', 'lead-generation', 'login', 'signup'].includes(def.intent)) {
      score += 0.1;
      reasons.push('Interactive form detected on page.');
    }
    if (pageState?.loadingIndicatorCount > 0 && def.intent === 'demo-interactive') {
      score += 0.1;
      reasons.push('Interactive loading/demo patterns detected.');
    }

    for (const keyword of customKeywords) {
      if (new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(corpus + ' ' + path)) {
        score += 0.15;
        reasons.push(`Matches collection keyword "${keyword}".`);
      }
    }

    if (path === '/' && def.intent === 'homepage') {
      score += 0.25;
      reasons.push('Root path often represents the homepage.');
    }

    if (score > best.score) {
      best = { intent: def.intent, score: Math.min(score, 1), reasons: reasons.slice(0, 4) };
    }
  }

  if (best.score < 0.35) {
    best = {
      intent: 'unknown',
      score: 0.25,
      reasons: ['Page purpose could not be determined confidently from generic signals.'],
    };
  }

  return {
    url: pageUrl,
    path,
    title,
    intent: best.intent,
    intentConfidence: confidenceLabel(best.score),
    confidenceScore: best.score,
    reasons: best.reasons,
    importance: importanceForIntent(best.intent, best.score),
    behaviorCount: options.behaviorCount || 0,
    suggestionCount: options.suggestionCount || 0,
  };
}

function intentDisplayLabel(intent) {
  const labels = {
    homepage: 'Homepage',
    contact: 'Contact',
    'lead-generation': 'Lead generation',
    login: 'Login',
    signup: 'Signup',
    product: 'Product',
    ecommerce: 'Ecommerce',
    cart: 'Cart',
    'checkout-start': 'Checkout start',
    pricing: 'Pricing / Conversion',
    booking: 'Booking',
    search: 'Search',
    dashboard: 'Dashboard / Account',
    'content/article': 'Content / Article',
    documentation: 'Documentation',
    'demo-interactive': 'Interactive demo',
    unknown: 'General page',
  };
  return labels[intent] || intent;
}

module.exports = {
  classifyPageIntent,
  intentDisplayLabel,
  pagePathFromUrl,
};
