const { captureScreenshot } = require('../scenarios/base');
const { NAVIGATION_TIMEOUT_MS } = require('../scenarios/constants');
const { extractInteractiveElements } = require('./extractElements');
const {
  detectChallengePage,
  buildWarningsFromDetection,
  resolveInspectionStatus,
} = require('./challengeDetection');
const { navigateWithSlashFallback } = require('./resolvePageUrl');
const { isPageUsable } = require('./pageUsability');

const STABILIZATION_MS = 1500;
const NETWORK_IDLE_TIMEOUT_MS = 5000;
const CHALLENGE_RETRY_WAIT_MS = 5000;
const MAX_CHALLENGE_RETRIES = 2;
const CONTENT_POLL_MS = 2000;
const MAX_TOTAL_LOAD_MS = 45000;

async function waitForMeaningfulContent(page, deadline) {
  let lastDetection = await detectChallengePage(page, 0);

  while (Date.now() < deadline) {
    const elements = await extractInteractiveElements(page, 100);
    lastDetection = await detectChallengePage(page, elements.length);

    if (!lastDetection.isChallenge && lastDetection.hasMeaningfulContent) {
      return { elements, detection: lastDetection, timedOut: false };
    }

    if (lastDetection.isChallenge && lastDetection.matchedPattern !== 'low-content') {
      for (let attempt = 0; attempt < MAX_CHALLENGE_RETRIES; attempt += 1) {
        await page.waitForTimeout(CHALLENGE_RETRY_WAIT_MS);
        const retryElements = await extractInteractiveElements(page, 100);
        lastDetection = await detectChallengePage(page, retryElements.length);
        if (!lastDetection.isChallenge && lastDetection.hasMeaningfulContent) {
          return { elements: retryElements, detection: lastDetection, timedOut: false };
        }
        if (!lastDetection.isChallenge) {
          return { elements: retryElements, detection: lastDetection, timedOut: false };
        }
      }
    }

    if (Date.now() >= deadline) break;
    await page.waitForTimeout(CONTENT_POLL_MS);
  }

  const elements = await extractInteractiveElements(page, 100);
  lastDetection = await detectChallengePage(page, elements.length);
  return { elements, detection: lastDetection, timedOut: Date.now() >= deadline };
}

async function loadPageForInspection(page, url) {
  const timing = {
    navigationStartedAt: new Date().toISOString(),
    domContentLoadedAt: null,
    screenshotTakenAt: null,
    loadDurationMs: 0,
    challengeDetected: false,
  };

  const startedMs = Date.now();
  const deadline = startedMs + MAX_TOTAL_LOAD_MS;
  let navigationFailed = false;

  try {
    const navigation = await navigateWithSlashFallback(page, url, {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (navigation.navigationFailed) {
      throw navigation.error || new Error('Could not open the page.');
    }
    timing.domContentLoadedAt = new Date().toISOString();
  } catch (error) {
    navigationFailed = true;
    timing.loadDurationMs = Date.now() - startedMs;
    return {
      status: 'error',
      warnings: [
        {
          type: 'navigation-error',
          message: error.message || 'Could not open the page.',
        },
      ],
      timing,
      title: '',
      finalUrl: page.url(),
      elements: [],
      detection: null,
    };
  }

  await page.waitForTimeout(STABILIZATION_MS);
  await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => {});

  const usability = await isPageUsable(page);
  const { elements, detection, timedOut } = await waitForMeaningfulContent(page, deadline);
  timing.challengeDetected = Boolean(detection?.isChallenge);

  let status = resolveInspectionStatus(detection, timedOut, navigationFailed);
  if (usability.usable && (status === 'timeout' || status === 'partial')) {
    status = 'ok';
  } else if (!usability.usable && status === 'ok') {
    status = 'partial';
  }

  const warnings = buildWarningsFromDetection(detection, status, usability);
  const title = detection?.title || (await page.title().catch(() => ''));

  let screenshotPath = null;
  if (status !== 'error') {
    screenshotPath = await captureScreenshot(page, 'inspector');
    timing.screenshotTakenAt = new Date().toISOString();
  }
  timing.loadDurationMs = Date.now() - startedMs;

  return {
    status,
    warnings,
    timing,
    title,
    finalUrl: page.url(),
    elements,
    detection,
    screenshotPath,
    usability,
  };
}

module.exports = {
  loadPageForInspection,
  MAX_TOTAL_LOAD_MS,
};
