function alternateSlashVariant(url) {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/') return null;

    if (parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    } else {
      parsed.pathname = `${parsed.pathname}/`;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

async function pageLooksEmpty(page) {
  return page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [role="button"], input, a[href]').length;
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    return buttons === 0 && bodyText.length < 40;
  });
}

async function navigateWithSlashFallback(page, url, options = {}) {
  const gotoOptions = {
    waitUntil: 'domcontentloaded',
    timeout: options.timeout,
    ...options.gotoOptions,
  };

  let response = null;
  try {
    response = await page.goto(url, gotoOptions);
  } catch (error) {
    return { response: null, finalUrl: page.url(), navigationFailed: true, error };
  }

  const status = response?.status?.() ?? 0;
  const empty = await pageLooksEmpty(page);
  const alternate = alternateSlashVariant(url);

  if (alternate && alternate !== url && (status === 404 || status === 410 || empty)) {
    try {
      const retryResponse = await page.goto(alternate, gotoOptions);
      const retryStatus = retryResponse?.status?.() ?? 0;
      const retryEmpty = await pageLooksEmpty(page);
      if (!retryEmpty && retryStatus !== 404 && retryStatus !== 410) {
        return {
          response: retryResponse,
          finalUrl: page.url(),
          navigationFailed: false,
          resolvedFrom: url,
        };
      }
    } catch {
      // Keep original navigation result below.
    }
  }

  return {
    response,
    finalUrl: page.url(),
    navigationFailed: false,
    resolvedFrom: url,
  };
}

module.exports = {
  alternateSlashVariant,
  navigateWithSlashFallback,
  pageLooksEmpty,
};
