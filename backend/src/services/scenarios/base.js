const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const config = require('../../config');
const { ConsoleTracker } = require('../scanner/consoleTracker');
const { NAVIGATION_TIMEOUT_MS } = require('./constants');

const SCREENSHOTS_DIR = config.screenshotsDir;
const VIDEOS_DIR = config.videosDir;

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

function createRunState(scenarioType) {
  return {
    scenarioType,
    steps: [],
    issues: [],
    consoleErrors: [],
    screenshotPath: null,
    summary: '',
  };
}

function addStep(state, name, status, message = '', durationMs = 0) {
  state.steps.push({ name, status, message, durationMs });
}

function addIssue(state, issue) {
  state.issues.push({
    type: issue.type || 'validation',
    severity: issue.severity || 'critical',
    message: issue.message,
    details: issue.details || null,
    recommendation: issue.recommendation || null,
  });
}

function computeScenarioScore(state, status) {
  if (status === 'passed') return 100;
  if (status === 'partial') return 60;
  if (status === 'failed') {
    const passedSteps = state.steps.filter((step) => step.status === 'passed').length;
    const total = state.steps.length || 1;
    return Math.max(0, Math.round((passedSteps / total) * 50));
  }
  return 0;
}

function resolveStatus(state) {
  const failedSteps = state.steps.filter((step) => step.status === 'failed').length;
  const passedSteps = state.steps.filter((step) => step.status === 'passed').length;

  if (failedSteps === 0 && passedSteps > 0) return 'passed';
  if (passedSteps > 0 && failedSteps > 0) return 'partial';
  if (failedSteps > 0) return 'failed';
  return 'error';
}

async function captureScreenshot(page, label = 'scenario') {
  const filename = `${label}-${Date.now()}.png`;
  const absolutePath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: absolutePath, fullPage: false });
  return `/uploads/screenshots/${filename}`;
}

async function withScenarioBrowser(options, run) {
  let browser = null;
  let context = null;
  let videoPage = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const viewport = options.viewport || { width: 1440, height: 900 };
    const contextOptions = {
      viewport,
      userAgent:
        options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 FlowTester/0.3',
    };

    if (options.recordVideo) {
      contextOptions.recordVideo = {
        dir: VIDEOS_DIR,
        size: { width: viewport.width, height: viewport.height },
      };
    }

    context = await browser.newContext(contextOptions);

    const helpers = {
      registerPage(page) {
        if (options.recordVideo) videoPage = page;
      },
    };

    const result = await run(context, helpers);

    if (videoPage && !videoPage.isClosed()) {
      await videoPage.close().catch(() => {});
    }

    await context.close().catch(() => {});

    let videoPath = null;
    if (options.recordVideo && videoPage) {
      const video = videoPage.video();
      if (video) {
        const rawPath = await video.path().catch(() => null);
        if (rawPath) {
          videoPath = `/uploads/videos/${path.basename(rawPath)}`;
        }
      }
    }

    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return { ...result, videoPath: videoPath || result.videoPath || null };
    }

    return result;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function openPage(context, url, consoleTracker) {
  const page = await context.newPage();
  consoleTracker.attach(page);

  const started = Date.now();
  let response = null;

  try {
    response = await page.goto(url, {
      waitUntil: 'load',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  } catch (error) {
    return {
      page,
      response,
      error: error.message,
      durationMs: Date.now() - started,
      finalUrl: page.url(),
    };
  }

  return {
    page,
    response,
    error: null,
    durationMs: Date.now() - started,
    finalUrl: page.url(),
  };
}

async function findBySelectorOrText(page, selector, text) {
  if (selector) {
    if (selector.startsWith('text=')) {
      const textValue = selector.slice(5);
      const textLocator = page.getByText(textValue, { exact: false }).first();
      if ((await textLocator.count()) > 0) {
        return textLocator;
      }
    }

    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  if (text) {
    const locator = page.getByRole('link', { name: text }).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
    const textLocator = page.getByText(text, { exact: false }).first();
    if ((await textLocator.count()) > 0) {
      return textLocator;
    }
  }

  return null;
}

function buildSummary(status, scenarioType, state) {
  const label = scenarioType.replace(/-/g, ' ');
  const stepSummary = `${state.steps.filter((s) => s.status === 'passed').length}/${state.steps.length} steps passed`;

  if (status === 'passed') {
    return `${label} scenario passed — ${stepSummary}.`;
  }
  if (status === 'partial') {
    return `${label} scenario partially passed — ${stepSummary}. Review failed steps below.`;
  }
  if (status === 'failed') {
    return `${label} scenario failed — ${stepSummary}.`;
  }
  return `${label} scenario encountered an error.`;
}

module.exports = {
  createRunState,
  addStep,
  addIssue,
  computeScenarioScore,
  resolveStatus,
  captureScreenshot,
  withScenarioBrowser,
  openPage,
  findBySelectorOrText,
  buildSummary,
};
