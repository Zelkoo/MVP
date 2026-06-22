const { ConsoleTracker } = require('../scanner/consoleTracker');
const { NetworkTracker } = require('../scanner/networkTracker');
const { withScenarioBrowser, captureScreenshot } = require('./base');
const { validateFlowSteps } = require('./flowSteps');
const { executeStep } = require('./flowRunner');
const { capturePageState } = require('./capturePageState');
const { detectSuccessSignals } = require('./detectSuccessSignals');

const ASSERTION_ACTIONS = new Set([
  'waitForText',
  'expectUrlContains',
  'expectVisible',
  'expectNetworkSuccess',
  'screenshot',
]);

const ACTION_ACTIONS = new Set(['goto', 'click', 'fill']);

function splitSteps(steps) {
  const actionSteps = [];
  const assertionSteps = [];

  for (const step of steps) {
    if (ASSERTION_ACTIONS.has(step.action)) {
      assertionSteps.push(step);
    } else if (ACTION_ACTIONS.has(step.action)) {
      actionSteps.push(step);
    }
  }

  return { actionSteps, assertionSteps };
}

function findTriggerStepIndex(actionSteps) {
  if (actionSteps.length === 0) return -1;

  for (let index = actionSteps.length - 1; index >= 0; index -= 1) {
    if (actionSteps[index].action === 'click') return index;
  }

  return actionSteps.length - 1;
}

async function dryRunAnalyzeFlow({ startUrl, steps, viewport }) {
  const normalizedSteps = validateFlowSteps(steps);
  const { actionSteps } = splitSteps(normalizedSteps);

  if (actionSteps.length === 0) {
    return {
      status: 'failed',
      error: 'Add at least one action step (open page, click, or fill) before analyzing success conditions.',
      suggestions: [],
      executedSteps: [],
    };
  }

  const triggerStepIndex = findTriggerStepIndex(actionSteps);
  const triggerStep = actionSteps[triggerStepIndex];

  return withScenarioBrowser({ viewport: viewport || { width: 1440, height: 900 } }, async (context) => {
    const consoleTracker = new ConsoleTracker();
    const networkTracker = new NetworkTracker();
    const page = await context.newPage();
    consoleTracker.attach(page);
    networkTracker.attach(page);

    const runContext = {
      startUrl,
      networkCheckpoint: 0,
    };

    const executedSteps = [];
    let beforeState = null;
    let afterState = null;
    let beforeScreenshotPath = null;
    let afterScreenshotPath = null;
    let triggerNetworkStart = 0;
    let failed = false;
    let failureMessage = null;

    try {
      for (let index = 0; index < actionSteps.length; index += 1) {
        const stepDef = actionSteps[index];

        if (stepDef.action === 'click' || stepDef.action === 'fill') {
          runContext.networkCheckpoint = networkTracker.getSuccessfulResponses().length;
        }

        if (index === triggerStepIndex) {
          triggerNetworkStart = networkTracker.getSuccessfulResponses().length;
          beforeState = await capturePageState(page);
          beforeScreenshotPath = await captureScreenshot(page, 'dry-run-before');
        }

        const result = await executeStep(page, stepDef, runContext, consoleTracker, networkTracker);
        executedSteps.push({
          label: stepDef.label || stepDef.action,
          action: stepDef.action,
          status: result.status,
          message: result.message || '',
        });

        if (result.status === 'failed') {
          failed = true;
          failureMessage = result.message || `Step failed: ${stepDef.label || stepDef.action}`;
          break;
        }

        if (index === triggerStepIndex) {
          await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(1200);
          afterState = await capturePageState(page);
          afterScreenshotPath = await captureScreenshot(page, 'dry-run-after');
        }
      }
    } finally {
      await page.close().catch(() => {});
    }

    if (!beforeState || !afterState) {
      return {
        status: failed ? 'failed' : 'partial',
        error: failureMessage || 'Could not capture page state around the trigger action.',
        triggerStepIndex,
        triggerStepLabel: triggerStep.label || triggerStep.action,
        beforeScreenshotPath,
        afterScreenshotPath,
        suggestions: [],
        executedSteps,
      };
    }

    const networkEvents = networkTracker
      .getSuccessfulResponses()
      .slice(triggerNetworkStart)
      .filter((entry) => ['POST', 'PUT', 'PATCH'].includes(entry.method));

    const suggestions = detectSuccessSignals({
      before: beforeState,
      after: afterState,
      networkEvents,
      triggerLabel: triggerStep.label || triggerStep.action,
    });

    return {
      status: failed ? 'partial' : suggestions.length > 0 ? 'ok' : 'partial',
      error: failureMessage,
      triggerStepIndex,
      triggerStepLabel: triggerStep.label || triggerStep.action,
      beforeScreenshotPath,
      afterScreenshotPath,
      beforeState: {
        url: beforeState.url,
        title: beforeState.title,
      },
      afterState: {
        url: afterState.url,
        title: afterState.title,
      },
      suggestions,
      executedSteps,
    };
  });
}

module.exports = {
  dryRunAnalyzeFlow,
  splitSteps,
  findTriggerStepIndex,
};
