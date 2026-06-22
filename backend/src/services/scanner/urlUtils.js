const SKIP_PROTOCOLS = /^(mailto:|tel:|javascript:)/i;

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    const url = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (SKIP_PROTOCOLS.test(rawUrl)) return null;

    url.hash = '';
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.href;
  } catch {
    return null;
  }
}

function getOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

function isSameOrigin(candidateUrl, siteOrigin) {
  try {
    return new URL(candidateUrl).origin === siteOrigin;
  } catch {
    return false;
  }
}

module.exports = { normalizeUrl, getOrigin, isSameOrigin, SKIP_PROTOCOLS };
