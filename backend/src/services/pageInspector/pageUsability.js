async function readDomUsabilitySignals(page) {
  return page.evaluate(() => {
    const body = document.body;
    const bodyText = (body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = document.title || '';
    const interactive = document.querySelectorAll(
      'a[href], button, input, textarea, select, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"]'
    ).length;
    const images = document.querySelectorAll('img, picture, svg').length;
    const containers = document.querySelectorAll(
      'figure, article, section, main, [class*="card"], [class*="tile"], [class*="item"]'
    ).length;
    const hoverLike = document.querySelectorAll('figure, img, [class*="card"], [class*="tile"]').length;
    const nodeCount = document.querySelectorAll('*').length;
    const visibleElements = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }).length;

    return {
      bodyExists: Boolean(body),
      bodyTextLength: bodyText.length,
      titleLength: title.trim().length,
      interactiveCount: interactive,
      imageCount: images,
      containerCount: containers,
      hoverLikeCount: hoverLike,
      nodeCount,
      visibleElementCount: visibleElements,
      hasVisibleLayout: nodeCount > 20 || containers > 0 || images > 0,
    };
  });
}

async function isPageUsable(page, options = {}) {
  const response = options.response || null;
  const status = response?.status?.() ?? options.httpStatus ?? 0;
  const challengeDetected = options.challengeDetected === true;

  if (status >= 500) {
    return {
      usable: false,
      status: 'error',
      reason: 'server-error',
      bodyTextLength: 0,
      visibleElementCount: 0,
      screenshotPossible: false,
      challengeDetected,
      signals: null,
    };
  }

  let signals;
  try {
    signals = await readDomUsabilitySignals(page);
  } catch {
    return {
      usable: false,
      status: 'error',
      reason: 'dom-read-failed',
      bodyTextLength: 0,
      visibleElementCount: 0,
      screenshotPossible: false,
      challengeDetected,
      signals: null,
    };
  }

  if (!signals.bodyExists) {
    return {
      usable: false,
      status: 'error',
      reason: 'missing-body',
      bodyTextLength: 0,
      visibleElementCount: signals.visibleElementCount || 0,
      screenshotPossible: false,
      challengeDetected,
      signals,
    };
  }

  if (challengeDetected && signals.bodyTextLength < 20 && signals.interactiveCount === 0) {
    return {
      usable: false,
      status: 'blocked',
      reason: 'challenge-detected',
      bodyTextLength: signals.bodyTextLength,
      visibleElementCount: signals.visibleElementCount,
      screenshotPossible: true,
      challengeDetected: true,
      signals,
    };
  }

  const hasContent =
    signals.bodyTextLength >= 20 ||
    signals.interactiveCount >= 1 ||
    signals.hoverLikeCount >= 1 ||
    signals.imageCount >= 1 ||
    signals.containerCount >= 1 ||
    signals.nodeCount >= 25;

  if (!hasContent) {
    return {
      usable: false,
      status: options.timedOut ? 'timeout' : 'partial',
      reason: 'empty-dom',
      bodyTextLength: signals.bodyTextLength,
      visibleElementCount: signals.visibleElementCount,
      screenshotPossible: true,
      challengeDetected,
      signals,
    };
  }

  return {
    usable: true,
    status: challengeDetected ? 'partial' : 'ok',
    reason: challengeDetected ? 'partial-with-challenge' : 'ok',
    bodyTextLength: signals.bodyTextLength,
    visibleElementCount: signals.visibleElementCount,
    screenshotPossible: true,
    challengeDetected,
    signals,
  };
}

module.exports = {
  isPageUsable,
  readDomUsabilitySignals,
};
