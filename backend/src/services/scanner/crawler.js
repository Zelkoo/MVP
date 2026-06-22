const { normalizeUrl, isSameOrigin, SKIP_PROTOCOLS } = require('./urlUtils');

async function extractInternalLinks(page, siteOrigin) {
  const hrefs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((anchor) => anchor.href);
  });

  const links = new Set();

  for (const href of hrefs) {
    if (!href || SKIP_PROTOCOLS.test(href)) continue;
    if (href === '#' || href.endsWith('#')) continue;

    const normalized = normalizeUrl(href);
    if (!normalized) continue;
    if (!isSameOrigin(normalized, siteOrigin)) continue;

    links.add(normalized);
  }

  return [...links];
}

function buildCrawlQueue(startUrl, siteOrigin) {
  const normalizedStart = normalizeUrl(startUrl);
  if (!normalizedStart || !isSameOrigin(normalizedStart, siteOrigin)) {
    return { queue: [], visited: new Set(), startUrl: normalizedStart };
  }

  return {
    queue: [normalizedStart],
    visited: new Set(),
    startUrl: normalizedStart,
  };
}

module.exports = { extractInternalLinks, buildCrawlQueue };
