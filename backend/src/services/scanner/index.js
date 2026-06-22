const { chromium } = require('playwright');
const fs = require('fs');
const config = require('../../config');
const { scanPage } = require('./pageScanner');
const { buildScanResult } = require('./buildResult');
const { buildCrawlQueue } = require('./crawler');
const { normalizeUrl, getOrigin } = require('./urlUtils');
const {
  GLOBAL_SCAN_TIMEOUT_MS,
  MAX_CRAWL_PAGES,
  ScanTimeoutError,
} = require('./constants');

const SCREENSHOTS_DIR = config.screenshotsDir;

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function isTimedOut(deadline) {
  return Date.now() >= deadline;
}

function createScanState(startUrl) {
  return {
    url: startUrl,
    siteOrigin: getOrigin(startUrl),
    startTime: Date.now(),
    timedOut: false,
    partial: false,
    globalTimeoutMs: GLOBAL_SCAN_TIMEOUT_MS,
    maxPages: MAX_CRAWL_PAGES,
    pages: [],
    brokenLinks: [],
    screenshots: {
      desktop: { path: null, captured: false, error: null },
      mobile: { path: null, captured: false, error: null },
    },
  };
}

async function runScan(url) {
  const normalizedStart = normalizeUrl(url) || url;
  const siteOrigin = getOrigin(normalizedStart);
  if (!siteOrigin) {
    throw new Error('Invalid URL origin.');
  }

  const state = createScanState(normalizedStart);
  const { queue, visited } = buildCrawlQueue(normalizedStart, siteOrigin);
  const timestamp = Date.now();
  const deadline = Date.now() + GLOBAL_SCAN_TIMEOUT_MS;

  let browser = null;
  let context = null;
  let globalTimer = null;

  const globalTimeoutPromise = new Promise((_, reject) => {
    globalTimer = setTimeout(() => reject(new ScanTimeoutError()), GLOBAL_SCAN_TIMEOUT_MS);
  });

  const crawlTask = async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FrontendQAAgent/1.0',
    });

    while (
      queue.length > 0 &&
      state.pages.length < MAX_CRAWL_PAGES &&
      !isTimedOut(deadline)
    ) {
      const nextUrl = queue.shift();
      const normalized = normalizeUrl(nextUrl);
      if (!normalized || visited.has(normalized)) continue;
      if (getOrigin(normalized) !== siteOrigin) continue;

      visited.add(normalized);

      const isFirstPage = state.pages.length === 0;
      const pageResult = await scanPage(context, normalized, {
        withScreenshots: isFirstPage,
        withBrokenLinks: isFirstPage,
        screenshotsDir: SCREENSHOTS_DIR,
        timestamp,
        siteOrigin,
      });

      pageResult.order = state.pages.length;
      state.pages.push(pageResult);

      if (isFirstPage) {
        state.brokenLinks = pageResult.brokenLinks || [];
        state.screenshots = pageResult.screenshots || state.screenshots;
      }

      if (pageResult.status === 'failed') {
        state.partial = true;
        continue;
      }

      for (const link of pageResult.internalLinks || []) {
        const normalizedLink = normalizeUrl(link);
        if (!normalizedLink || visited.has(normalizedLink)) continue;
        if (getOrigin(normalizedLink) !== siteOrigin) continue;
        if (queue.includes(normalizedLink)) continue;
        queue.push(normalizedLink);
      }
    }

    if (isTimedOut(deadline) && queue.length > 0) {
      state.timedOut = true;
      state.partial = true;
    }
  };

  try {
    await Promise.race([crawlTask(), globalTimeoutPromise]);
  } catch (error) {
    if (error instanceof ScanTimeoutError) {
      state.timedOut = true;
      state.partial = true;
    } else {
      throw error;
    }
  } finally {
    if (globalTimer) clearTimeout(globalTimer);
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  if (state.pages.length === 0) {
    throw new Error('No pages could be analyzed.');
  }

  return buildScanResult(state);
}

module.exports = { runScan };
