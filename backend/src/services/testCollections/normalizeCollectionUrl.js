function normalizeCollectionUrl(inputUrl) {
  const parsed = new URL(inputUrl);
  const origin = parsed.origin.replace(/\/$/, '');
  const domain = parsed.hostname;
  const pathname = parsed.pathname || '/';

  return {
    origin,
    domain,
    name: domain,
    startUrl: `${origin}/`,
    path: pathname === '/' ? '/' : pathname.replace(/\/$/, '') || '/',
    sourceUrl: `${origin}${pathname}${parsed.search || ''}`,
  };
}

function sourcePath(sourceUrl, origin) {
  try {
    const parsed = new URL(sourceUrl);
    const path = parsed.pathname || '/';
    return path === '' ? '/' : path;
  } catch {
    return sourceUrl.replace(origin, '') || '/';
  }
}

module.exports = {
  normalizeCollectionUrl,
  sourcePath,
};
