const CHALLENGE_TEXT_PATTERNS = [
  'checking your browser',
  'just a moment',
  'verify you are human',
  'please wait while we check your browser',
  'cloudflare',
  'attention required',
  'enable javascript and cookies',
  'ddos protection',
  'browser verification',
  'security check',
  'cf-browser-verification',
];

const CHALLENGE_TITLE_PATTERNS = [
  'just a moment',
  'checking your browser',
  'attention required',
  'please wait',
  'cloudflare',
];

const MIN_BODY_TEXT_LENGTH = 200;
const MIN_INTERACTIVE_ELEMENTS = 3;
const MIN_DISCOVERY_INTERACTIVE_ELEMENTS = 1;

async function readPageSignals(page) {
  return page.evaluate(() => {
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const title = document.title || '';
    const visibleInputs = document.querySelectorAll(
      'a[href], button, input, textarea, select, [role="button"], [role="link"]'
    ).length;
    const visualBlocks = document.querySelectorAll(
      'figure, img, article, [class*="card"], [class*="tile"], [class*="figure"]'
    ).length;
    return {
      bodyText,
      title,
      bodyTextLength: bodyText.length,
      visibleInteractiveCount: visibleInputs,
      visualBlockCount: visualBlocks,
    };
  });
}

function matchesPattern(text, patterns) {
  const lower = (text || '').toLowerCase();
  return patterns.find((pattern) => lower.includes(pattern)) || null;
}

async function detectChallengePage(page, interactiveElementCount = 0) {
  const signals = await readPageSignals(page);
  const combinedText = `${signals.title} ${signals.bodyText}`;
  const matchedText = matchesPattern(combinedText, CHALLENGE_TEXT_PATTERNS);
  const matchedTitle = matchesPattern(signals.title, CHALLENGE_TITLE_PATTERNS);

  const tooLittleContent =
    signals.bodyTextLength < MIN_BODY_TEXT_LENGTH &&
    interactiveElementCount < MIN_DISCOVERY_INTERACTIVE_ELEMENTS;

  const hasMinimalDiscoveryContent =
    interactiveElementCount >= MIN_DISCOVERY_INTERACTIVE_ELEMENTS &&
    signals.title.trim().length > 0 &&
    !matchedText &&
    !matchedTitle;

  const hasVisualDiscoveryContent =
    signals.visualBlockCount >= 1 &&
    signals.title.trim().length > 0 &&
    !matchedText &&
    !matchedTitle;

  const hasMeaningfulContent =
    (signals.bodyTextLength >= MIN_BODY_TEXT_LENGTH &&
      interactiveElementCount >= MIN_INTERACTIVE_ELEMENTS &&
      signals.title.trim().length > 0) ||
    hasMinimalDiscoveryContent ||
    hasVisualDiscoveryContent;

  const isChallenge = Boolean(matchedText || matchedTitle || tooLittleContent);

  return {
    isChallenge,
    hasMeaningfulContent,
    tooLittleContent,
    matchedPattern: matchedText || matchedTitle || (tooLittleContent ? 'low-content' : null),
    bodyTextLength: signals.bodyTextLength,
    interactiveElementCount,
    title: signals.title,
  };
}

function buildWarningsFromDetection(detection, status, usability = null) {
  const warnings = [];

  if (status === 'blocked' || (detection.isChallenge && detection.matchedPattern !== 'low-content')) {
    warnings.push({
      type: 'bot-protection',
      message:
        'This site appears to show a bot protection or browser check page. The preview may not represent the real page.',
    });
  }

  if (status === 'timeout' && !(usability?.usable)) {
    warnings.push({
      type: 'timeout',
      message: 'The page did not finish loading within the allowed time.',
    });
  }

  if (status === 'partial' && detection.tooLittleContent && !(usability?.usable)) {
    warnings.push({
      type: 'low-content',
      message:
        'The page loaded but we could not detect much useful content yet. The preview may be incomplete.',
    });
  }

  if (
    status !== 'blocked' &&
    detection.interactiveElementCount < MIN_INTERACTIVE_ELEMENTS &&
    !detection.hasMeaningfulContent &&
    !(usability?.usable)
  ) {
    warnings.push({
      type: 'low-content',
      message:
        'We could not detect useful interactive elements. Try waiting longer, using another URL, or switching to the advanced builder.',
    });
  }

  return warnings;
}

function resolveInspectionStatus(detection, timedOut, navigationFailed) {
  if (navigationFailed) return 'error';
  if (timedOut && !detection.hasMeaningfulContent) return 'timeout';

  if (detection.isChallenge) {
    if (detection.matchedPattern && detection.matchedPattern !== 'low-content') {
      return 'blocked';
    }
    return 'partial';
  }

  if (!detection.hasMeaningfulContent) {
    return timedOut ? 'timeout' : 'partial';
  }

  return 'ok';
}

module.exports = {
  detectChallengePage,
  buildWarningsFromDetection,
  resolveInspectionStatus,
  MIN_INTERACTIVE_ELEMENTS,
  MIN_BODY_TEXT_LENGTH,
};
