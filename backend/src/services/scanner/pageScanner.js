const { NetworkTracker } = require('./networkTracker');
const { ConsoleTracker } = require('./consoleTracker');
const { runAccessibilityChecks } = require('./accessibilityChecks');
const { captureScreenshots } = require('./screenshots');
const { findBrokenLinks } = require('./linkChecker');
const { extractInternalLinks } = require('./crawler');
const { NAVIGATION_TIMEOUT_MS } = require('./constants');
const { getOrigin } = require('./urlUtils');

async function scanPage(context, targetUrl, options = {}) {
  const {
    withScreenshots = false,
    withBrokenLinks = false,
    screenshotsDir,
    timestamp,
    siteOrigin,
  } = options;

  const page = await context.newPage();
  const network = new NetworkTracker();
  const consoleTracker = new ConsoleTracker();
  network.attach(page);
  consoleTracker.attach(page);

  const result = {
    url: targetUrl,
    finalUrl: targetUrl,
    title: '',
    statusCode: null,
    loadDurationMs: 0,
    totalRequests: 0,
    failedRequestsCount: 0,
    status: 'completed',
    error: null,
    consoleErrors: [],
    failedRequests: [],
    errorResponses: [],
    accessibilityIssues: [],
    internalLinks: [],
    brokenLinks: [],
    screenshots: null,
  };

  const origin = siteOrigin || getOrigin(targetUrl);

  try {
    const navigationStart = Date.now();
    let response = null;

    try {
      response = await page.goto(targetUrl, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    } catch (navigationError) {
      result.error = navigationError.message;
      if (!page.url() || page.url() === 'about:blank') {
        result.status = 'failed';
        return result;
      }
      result.status = 'partial';
    }

    result.loadDurationMs = Date.now() - navigationStart;
    result.finalUrl = page.url();
    result.title = await page.title().catch(() => '');
    result.statusCode = response?.status() ?? null;

    const networkSummary = network.summary();
    result.consoleErrors = consoleTracker.getDeduped();
    result.failedRequests = networkSummary.failed;
    result.errorResponses = networkSummary.errorResponses;
    result.totalRequests = networkSummary.totalRequests;
    result.failedRequestsCount = networkSummary.failedRequestsCount;

    result.accessibilityIssues = await runAccessibilityChecks(page, result.title);

    if (origin) {
      result.internalLinks = await extractInternalLinks(page, origin);
    }

    if (withScreenshots && screenshotsDir && timestamp != null) {
      result.screenshots = await captureScreenshots(page, screenshotsDir, timestamp);
    }

    if (withBrokenLinks) {
      result.brokenLinks = await findBrokenLinks(page, result.finalUrl);
    }
  } catch (error) {
    result.status = 'failed';
    result.error = error.message;
  } finally {
    await page.close().catch(() => {});
  }

  return result;
}

module.exports = { scanPage };
