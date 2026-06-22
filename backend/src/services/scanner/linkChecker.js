const { LINK_CHECK_TIMEOUT_MS, MAX_LINKS_TO_CHECK } = require('./constants');

const SKIP_PROTOCOLS = /^(mailto:|tel:|javascript:)/i;

function isCheckableHref(href) {
  if (!href) return false;
  if (SKIP_PROTOCOLS.test(href)) return false;
  if (href === '#' || href.startsWith('#')) return false;
  return href.startsWith('http://') || href.startsWith('https://');
}

function classifyLinkScope(href, pageOrigin) {
  try {
    const linkOrigin = new URL(href).origin;
    return linkOrigin === pageOrigin ? 'internal' : 'external';
  } catch {
    return 'external';
  }
}

async function resolveLinkStatus(page, href) {
  const fetchOptions = { timeout: LINK_CHECK_TIMEOUT_MS, maxRedirects: 5 };

  const tryGet = async () => {
    const response = await page.request.fetch(href, { ...fetchOptions, method: 'GET' });
    return response.status();
  };

  try {
    const headResponse = await page.request.fetch(href, { ...fetchOptions, method: 'HEAD' });
    const headStatus = headResponse.status();
    if (headStatus >= 200 && headStatus < 400) return headStatus;
    if (headStatus === 405 || headStatus === 501) return tryGet();
    return headStatus;
  } catch {
    try {
      return await tryGet();
    } catch {
      return null;
    }
  }
}

function isBrokenStatus(status) {
  if (status === null) return true;
  // Link exists but requires auth or is forbidden — not a dead-end URL.
  if (status === 401 || status === 403) return false;
  return status >= 400;
}

async function findBrokenLinks(page, pageUrl) {
  const pageOrigin = new URL(pageUrl).origin;

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map((anchor) => ({
      href: anchor.href,
      text: (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    }));
  });

  const unique = [];
  const seen = new Set();

  for (const link of links) {
    if (!isCheckableHref(link.href) || seen.has(link.href)) continue;
    seen.add(link.href);
    unique.push({
      ...link,
      scope: classifyLinkScope(link.href, pageOrigin),
    });
  }

  const broken = [];

  for (const link of unique.slice(0, MAX_LINKS_TO_CHECK)) {
    const status = await resolveLinkStatus(page, link.href);
    if (isBrokenStatus(status)) {
      broken.push({ ...link, status });
    }
  }

  return broken;
}

module.exports = { findBrokenLinks, isCheckableHref, classifyLinkScope };
