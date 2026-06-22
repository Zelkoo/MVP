const { classifyLinkScope, isCheckableHref } = require('../scanner/linkChecker');
const { rankLinks } = require('./scoreLinks');
const { isLinkSafeToFollow } = require('./safetyClassifier');
const { isPathIgnored } = require('../testCollections/collectionAnalyzerSettings');

async function extractInternalLinks(page, pageUrl) {
  const pageOrigin = new URL(pageUrl).origin;

  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]')).map((anchor) => {
      const rect = anchor.getBoundingClientRect();
      return {
        href: anchor.href,
        text: (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        ariaLabel: anchor.getAttribute('aria-label') || '',
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    })
  );

  const unique = [];
  const seen = new Set();

  for (const link of links) {
    if (!isCheckableHref(link.href)) continue;
    if (!isLinkSafeToFollow(link)) continue;

    const scope = classifyLinkScope(link.href, pageOrigin);
    if (scope !== 'internal') continue;

    const normalized = link.href.split('#')[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    unique.push({ ...link, href: normalized, scope });
  }

  return unique;
}

function planInternalPages(startUrl, links, maxPages = 10, analyzerSettings = {}) {
  const origin = new URL(startUrl).origin;
  const filteredLinks = links.filter((link) => {
    try {
      const path = new URL(link.href).pathname || '/';
      return !isPathIgnored(path, analyzerSettings.ignoredPaths);
    } catch {
      return true;
    }
  });
  const ranked = rankLinks(filteredLinks, origin, 900, analyzerSettings);
  const pages = [{ url: startUrl.split('#')[0], score: 1, source: 'start' }];

  for (const entry of ranked) {
    if (pages.length >= maxPages) break;
    if (pages.some((page) => page.url === entry.link.href)) continue;
    pages.push({ url: entry.link.href, score: entry.score, source: 'discovered' });
  }

  return pages;
}

module.exports = {
  extractInternalLinks,
  planInternalPages,
};
