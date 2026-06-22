const USEFUL_LINK_KEYWORDS =
  /\b(contact|form|input|checkbox|dropdown|upload|download|login|auth|signup|sign-up|register|modal|dynamic|notification|cart|checkout|pricing|booking|appointment|add|remove|hover|menu|table|key|redirect|loading|drag|sortable|frame|alert|cookie|floating|product|search|dashboard|account|settings|demo|feature|toggle|expand|collapse|subscribe|newsletter|profile|gallery|shop|store|order|wishlist|compare|filter|sort|tab|wizard|step|onboard|trial|plan|billing|payment-info|support|help|faq|docs|api|status|signup|sign-up)\b/i;

const AVOID_LINK_KEYWORDS =
  /\b(logout|log out|sign out|delete account|remove user|place order|confirm order|cancel subscription|unsubscribe|delete all|purge|destroy)\b/i;

function scoreLink(link, pageOrigin, viewportHeight = 900, analyzerSettings = {}) {
  const href = link.href || '';
  const text = `${link.text || ''} ${link.ariaLabel || ''}`.trim();
  const lower = text.toLowerCase();
  const path = href.replace(pageOrigin, '').toLowerCase();

  if (!href.startsWith('http')) return -1;
  if (link.scope === 'external') return -1;
  if (AVOID_LINK_KEYWORDS.test(lower) || AVOID_LINK_KEYWORDS.test(path)) return -1;
  if (/\b(pay|purchase|payment|checkout\/confirm|admin\/delete)\b/i.test(lower + ' ' + path)) return -1;
  if (!text || text.length < 2) return 0.1;

  let score = 0.35;
  if (USEFUL_LINK_KEYWORDS.test(lower) || USEFUL_LINK_KEYWORDS.test(path)) score += 0.35;
  if (link.boundingBox && link.boundingBox.y < viewportHeight * 0.75) score += 0.1;
  if (text.length >= 4 && text.length <= 40) score += 0.1;
  if (/example|demo|test|practice|sample/.test(lower)) score += 0.05;
  if (path.split('/').filter(Boolean).length <= 2) score += 0.05;

  for (const keyword of analyzerSettings.importantKeywords || []) {
    if (!keyword) continue;
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower) || pattern.test(path)) score += 0.2;
  }

  return Math.min(score, 1);
}

function rankLinks(links, pageOrigin, viewportHeight = 900, analyzerSettings = {}) {
  return links
    .map((link) => ({ link, score: scoreLink(link, pageOrigin, viewportHeight, analyzerSettings) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  scoreLink,
  rankLinks,
};
