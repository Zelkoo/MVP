const { ConsoleTracker } = require('../scanner/consoleTracker');
const { NetworkTracker } = require('../scanner/networkTracker');
const {
  createRunState,
  addIssue,
  computeScenarioScore,
  resolveStatus,
  captureScreenshot,
  withScenarioBrowser,
  buildSummary,
} = require('./base');
const { stepLabel, STEP_RECOMMENDATIONS } = require('./flowSteps');
const { humanizeStepError } = require('./humanizeError');
const { NAVIGATION_TIMEOUT_MS } = require('./constants');
const {
  ELEMENT_NOT_FOUND_MESSAGE,
  ELEMENT_NOT_FOUND_RECOMMENDATION,
  resolveElementTarget,
  passedStepMessage,
  formatAttemptsForDevDetails,
} = require('./selectorFallback');

function recordStep(state, stepDef, result) {
  const entry = {
    name: stepDef.label || stepLabel(stepDef),
    action: stepDef.action,
    status: result.status,
    message: result.message || '',
    technicalDetails: result.technicalDetails || null,
    durationMs: result.durationMs || 0,
    screenshotPath: result.screenshotPath || null,
    consoleErrors: result.consoleErrors || [],
  };

  if (result.selectorUsed) entry.selectorUsed = result.selectorUsed;
  if (result.selectorStrategy) entry.selectorStrategy = result.selectorStrategy;
  if (result.attempts) entry.attempts = result.attempts;
  if (result.selectorSuggestion) entry.selectorSuggestion = result.selectorSuggestion;

  state.steps.push(entry);
}

async function failStep(page, stepDef, error, started, timeoutMs, consoleErrors = [], extra = {}) {
  let screenshotPath = null;
  if (page) {
    try {
      screenshotPath = await captureScreenshot(page, `flow-fail-${stepDef.action}`);
    } catch {
      screenshotPath = null;
    }
  }

  const technicalDetails =
    extra.technicalDetails || error.message || String(error);
  const message = extra.message || humanizeStepError(stepDef, error, timeoutMs);

  return {
    status: 'failed',
    message,
    technicalDetails,
    durationMs: Date.now() - started,
    screenshotPath,
    consoleErrors,
    attempts: extra.attempts || undefined,
    selectorUsed: extra.selectorUsed || undefined,
    selectorStrategy: extra.selectorStrategy || undefined,
  };
}

async function failElementStep(page, stepDef, started, timeoutMs, consoleErrors, resolution) {
  return failStep(
    page,
    stepDef,
    new Error(ELEMENT_NOT_FOUND_MESSAGE),
    started,
    timeoutMs,
    consoleErrors,
    {
      message: ELEMENT_NOT_FOUND_MESSAGE,
      technicalDetails: formatAttemptsForDevDetails(resolution.attempts),
      attempts: resolution.attempts,
    }
  );
}

function selectorSuggestion(stepDef, resolution) {
  if (!resolution?.selectorUsed || resolution.selectorStrategy === 'primary') {
    return null;
  }
  return {
    message: `This step succeeded using a ${resolution.selectorStrategy} fallback. Consider updating the primary selector to improve stability.`,
    recommendedSelector: resolution.selectorUsed,
    recommendedStrategy: resolution.selectorStrategy,
    currentSelector: stepDef.selector || null,
  };
}

async function executeStep(page, stepDef, context, consoleTracker, networkTracker) {
  const started = Date.now();
  const timeout = stepDef.timeoutMs || 8000;
  const consoleBefore = consoleTracker.getDeduped().length;

  try {
    switch (stepDef.action) {
      case 'goto': {
        const targetUrl = stepDef.url || context.startUrl;
        await page.goto(targetUrl, {
          waitUntil: 'load',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        return {
          status: 'passed',
          message: page.url(),
          durationMs: Date.now() - started,
        };
      }

      case 'hover': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'hover',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        await resolution.locator.hover({ timeout: perAttemptTimeout(timeout) });
        await page.waitForTimeout(400);
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
          technicalDetails:
            resolution.selectorStrategy !== 'primary' || resolution.attempts.length > 1
              ? formatAttemptsForDevDetails(resolution.attempts)
              : null,
        };
      }

      case 'click': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'click',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        await resolution.locator.click({ timeout: perAttemptTimeout(timeout) });
        await page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
          technicalDetails:
            resolution.selectorStrategy !== 'primary' || resolution.attempts.length > 1
              ? formatAttemptsForDevDetails(resolution.attempts)
              : null,
        };
      }

      case 'fill': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'fill',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        const tagName = await resolution.locator
          .evaluate((el) => el.tagName.toLowerCase())
          .catch(() => '');
        if (tagName === 'select') {
          await resolution.locator.selectOption(stepDef.value ?? '', {
            timeout: perAttemptTimeout(timeout),
          });
        } else {
          await resolution.locator.fill(stepDef.value ?? '', { timeout: perAttemptTimeout(timeout) });
        }
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
          technicalDetails:
            resolution.selectorStrategy !== 'primary' || resolution.attempts.length > 1
              ? formatAttemptsForDevDetails(resolution.attempts)
              : null,
        };
      }

      case 'select': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'fill',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        await resolution.locator.selectOption(stepDef.value ?? '', {
          timeout: perAttemptTimeout(timeout),
        });
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
          technicalDetails:
            resolution.selectorStrategy !== 'primary' || resolution.attempts.length > 1
              ? formatAttemptsForDevDetails(resolution.attempts)
              : null,
        };
      }

      case 'check': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'click',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        await resolution.locator.check({ timeout: perAttemptTimeout(timeout) });
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
        };
      }

      case 'uncheck': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'click',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        await resolution.locator.uncheck({ timeout: perAttemptTimeout(timeout) });
        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
        };
      }

      case 'press': {
        const key = String(stepDef.value || 'Enter');
        if (stepDef.selector || stepDef.targetText || stepDef.targetRole) {
          const resolution = await resolveElementTarget(page, stepDef, {
            action: 'fill',
            timeoutMs: timeout,
            requireVisible: true,
          });
          if (resolution.failed) {
            throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
              resolution,
              elementNotFound: true,
            });
          }
          await resolution.locator.press(key, { timeout: perAttemptTimeout(timeout) });
        } else {
          await page.keyboard.press(key);
        }
        await page.waitForTimeout(300);
        return {
          status: 'passed',
          message: `Pressed ${key}`,
          durationMs: Date.now() - started,
        };
      }

      case 'waitForText': {
        await page.getByText(stepDef.text, { exact: false }).first().waitFor({
          state: 'visible',
          timeout,
        });
        return {
          status: 'passed',
          message: stepDef.text,
          durationMs: Date.now() - started,
        };
      }

      case 'expectUrlContains': {
        const current = page.url().toLowerCase();
        const expected = String(stepDef.value).toLowerCase();
        if (!current.includes(expected)) {
          throw new Error(`URL "${page.url()}" does not contain "${stepDef.value}".`);
        }
        return {
          status: 'passed',
          message: page.url(),
          durationMs: Date.now() - started,
        };
      }

      case 'expectVisible': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'expectVisible',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        return {
          status: 'passed',
          message: passedStepMessage(stepDef, resolution),
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
          selectorSuggestion: selectorSuggestion(stepDef, resolution),
          technicalDetails:
            resolution.selectorStrategy !== 'primary' || resolution.attempts.length > 1
              ? formatAttemptsForDevDetails(resolution.attempts)
              : null,
        };
      }

      case 'expectHidden': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'expectVisible',
          timeoutMs: timeout,
          requireVisible: false,
        });
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
          const check = await resolveElementTarget(page, stepDef, {
            action: 'expectVisible',
            timeoutMs: perAttemptTimeout(1000),
            requireVisible: true,
          });
          if (check.failed) {
            return {
              status: 'passed',
              message: `Confirmed ${stepDef.elementLabel || stepDef.label || 'element'} is no longer visible`,
              durationMs: Date.now() - started,
              selectorUsed: resolution.selectorUsed || stepDef.selector,
              selectorStrategy: resolution.selectorStrategy || 'primary',
            };
          }
          await page.waitForTimeout(250);
        }

        throw new Error(
          `${stepDef.elementLabel || stepDef.label || 'Element'} is still visible after the action.`
        );
      }

      case 'expectValue': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'fill',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        const actual = await resolution.locator.inputValue({ timeout: perAttemptTimeout(timeout) }).catch(async () => {
          return resolution.locator.evaluate((el) => el.value || el.textContent || '').catch(() => '');
        });
        const expected = String(stepDef.value ?? '');
        if (actual !== expected) {
          throw new Error(`Expected value "${expected}" but found "${actual}".`);
        }

        return {
          status: 'passed',
          message: expected,
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
        };
      }

      case 'expectChecked': {
        const resolution = await resolveElementTarget(page, stepDef, {
          action: 'click',
          timeoutMs: timeout,
          requireVisible: true,
        });

        if (resolution.failed) {
          throw Object.assign(new Error(ELEMENT_NOT_FOUND_MESSAGE), {
            resolution,
            elementNotFound: true,
          });
        }

        const expected = stepDef.value !== false && stepDef.value !== 'false';
        const checked = await resolution.locator.isChecked({ timeout: perAttemptTimeout(timeout) }).catch(() => false);
        if (checked !== expected) {
          throw new Error(
            expected
              ? `${stepDef.elementLabel || stepDef.label || 'Control'} is not checked.`
              : `${stepDef.elementLabel || stepDef.label || 'Control'} is still checked.`
          );
        }

        return {
          status: 'passed',
          message: expected ? 'Checked' : 'Unchecked',
          durationMs: Date.now() - started,
          selectorUsed: resolution.selectorUsed,
          selectorStrategy: resolution.selectorStrategy,
          attempts: resolution.attempts,
        };
      }

      case 'expectNetworkSuccess': {
        const urlPattern = stepDef.value ? String(stepDef.value) : null;
        const sinceIndex = context.networkCheckpoint || 0;
        const deadline = Date.now() + timeout;
        let match = null;

        while (Date.now() < deadline) {
          match = networkTracker.findSuccessfulResponse({ urlPattern, sinceIndex });
          if (match) break;
          await page.waitForTimeout(250);
        }

        if (!match) {
          throw new Error(
            urlPattern
              ? `No successful 2xx response matching "${stepDef.value}" was detected.`
              : 'No successful 2xx network response was detected.'
          );
        }

        return {
          status: 'passed',
          message: `${match.method} ${match.url} → ${match.status}`,
          durationMs: Date.now() - started,
        };
      }

      case 'screenshot': {
        const screenshotPath = await captureScreenshot(
          page,
          `flow-${stepDef.label || 'step'}`.replace(/\s+/g, '-').slice(0, 40)
        );
        context.lastScreenshot = screenshotPath;
        return {
          status: 'passed',
          message: 'Screenshot captured',
          durationMs: Date.now() - started,
          screenshotPath,
        };
      }

      default:
        throw new Error(`Unsupported action: ${stepDef.action}`);
    }
  } catch (error) {
    const consoleErrors = consoleTracker.getDeduped().slice(consoleBefore);
    if (error.elementNotFound && error.resolution) {
      return failElementStep(page, stepDef, started, timeout, consoleErrors, error.resolution);
    }
    return failStep(page, stepDef, error, started, timeout, consoleErrors);
  }
}

function perAttemptTimeout(timeoutMs) {
  return Math.max(1500, Math.min(timeoutMs, 5000));
}

async function runFlow(scenario) {
  const steps = scenario.config?.steps || [];
  const viewport = scenario.config?.viewport || { width: 1440, height: 900 };
  const recordVideo = scenario.config?.recordVideo === true;

  return withScenarioBrowser({ viewport, recordVideo }, async (context, helpers) => {
    const state = createRunState('flow');
    const consoleTracker = new ConsoleTracker();
    const networkTracker = new NetworkTracker();
    const page = await context.newPage();
    helpers?.registerPage?.(page);
    consoleTracker.attach(page);
    networkTracker.attach(page);

    const runContext = {
      startUrl: scenario.startUrl,
      lastScreenshot: null,
      networkCheckpoint: 0,
    };

    let consoleToReport = [];

    try {
      for (const stepDef of steps) {
        if (stepDef.action === 'click' || stepDef.action === 'fill' || stepDef.action === 'select') {
          runContext.networkCheckpoint = networkTracker.getSuccessfulResponses().length;
        }

        const result = await executeStep(page, stepDef, runContext, consoleTracker, networkTracker);
        recordStep(state, stepDef, result);

        if (result.status === 'failed') {
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: result.message || `Step failed: ${stepDef.label || stepLabel(stepDef)}`,
            details: result.technicalDetails || result.message,
            recommendation:
              result.attempts?.length && stepDef.selector
                ? ELEMENT_NOT_FOUND_RECOMMENDATION
                : STEP_RECOMMENDATIONS[stepDef.action] || 'Review this step configuration.',
          });
          if (result.screenshotPath) {
            state.screenshotPath = result.screenshotPath;
          }
        }

        if (result.screenshotPath && stepDef.action === 'screenshot') {
          state.screenshotPath = result.screenshotPath;
        }
      }

      state.consoleErrors = consoleTracker.getDeduped();
      const failedStepConsole = state.steps.flatMap((step) =>
        step.status === 'failed' ? step.consoleErrors || [] : []
      );
      consoleToReport = failedStepConsole.length ? failedStepConsole : state.consoleErrors;

      for (const error of consoleToReport) {
        addIssue(state, {
          type: 'console-error',
          severity: 'warning',
          message: 'Console error during flow',
          details: error,
          recommendation: 'Fix JavaScript errors triggered during this user flow.',
        });
      }

      if (!state.screenshotPath && runContext.lastScreenshot) {
        state.screenshotPath = runContext.lastScreenshot;
      }
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }

    const status = resolveStatus(state);
    state.summary = buildSummary(status, 'flow', state);

    return {
      status,
      score: computeScenarioScore(state, status),
      result: {
        steps: state.steps,
        issues: state.issues,
        consoleErrors: consoleToReport,
        summary: state.summary,
      },
      screenshotPath: state.screenshotPath,
    };
  });
}

module.exports = { runFlow, executeStep };
