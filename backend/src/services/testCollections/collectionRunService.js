const scenarioRepository = require('../scenarioRepository');
const collectionRepository = require('./collectionRepository');
const collectionRunRepository = require('./collectionRunRepository');
const { runScenario } = require('../scenarios');

const cancelFlags = new Map();

function nowIso() {
  return new Date().toISOString();
}

function computeRunStatus(passed, failed, skipped, total) {
  if (skipped === total) return 'cancelled';
  if (failed === 0 && passed === total) return 'passed';
  if (passed === 0 && failed > 0 && skipped === 0) return 'failed';
  return 'partial';
}

function passRate(passed, total) {
  if (!total) return 0;
  return Math.round((passed / total) * 100);
}

async function runScenarioItem(scenario, recordVideo = false) {
  const payload = recordVideo
    ? { ...scenario, config: { ...(scenario.config || {}), recordVideo: true } }
    : scenario;

  try {
    const outcome = await runScenario(payload);
    const run = scenarioRepository.createScenarioRun(scenario.id, outcome);
    return {
      status: run.status,
      scenarioRunId: run.id,
      errorMessage: run.status === 'passed' ? null : run.result?.summary || null,
    };
  } catch (error) {
    const run = scenarioRepository.createScenarioRun(scenario.id, {
      status: 'error',
      score: 0,
      screenshotPath: null,
      result: {
        steps: [{ name: 'Run scenario', status: 'failed', message: error.message }],
        issues: [],
        consoleErrors: [],
        summary: error.message,
      },
    });
    return {
      status: 'error',
      scenarioRunId: run.id,
      errorMessage: error.message,
    };
  }
}

async function executeCollectionRun(runId) {
  const run = collectionRunRepository.getCollectionRunById(runId);
  if (!run) return;

  cancelFlags.set(runId, false);
  const startedMs = Date.now();

  collectionRunRepository.updateCollectionRun(runId, {
    status: 'running',
    startedAt: run.startedAt || nowIso(),
  });

  const items = run.items || [];
  const parallelism = Math.min(Math.max(run.parallelism || 2, 1), 4);
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let nextIndex = 0;

  const runOne = async (item) => {
    if (cancelFlags.get(runId)) {
      collectionRunRepository.updateCollectionRunItem(item.id, {
        status: 'skipped',
        finishedAt: nowIso(),
        errorMessage: 'Cancelled before start',
      });
      skippedCount += 1;
      collectionRunRepository.updateCollectionRun(runId, {
        passedCount,
        failedCount,
        skippedCount,
      });
      return;
    }

    const scenario = scenarioRepository.getScenarioById(item.scenarioId);
    if (!scenario) {
      collectionRunRepository.updateCollectionRunItem(item.id, {
        status: 'skipped',
        startedAt: nowIso(),
        finishedAt: nowIso(),
        errorMessage: 'Scenario not found or deleted',
      });
      skippedCount += 1;
      return;
    }

    collectionRunRepository.updateCollectionRunItem(item.id, {
      status: 'running',
      startedAt: nowIso(),
    });

    const outcome = await runScenarioItem(scenario, false);
    const isPassed = outcome.status === 'passed';
    if (isPassed) passedCount += 1;
    else failedCount += 1;

    collectionRunRepository.updateCollectionRunItem(item.id, {
      status: outcome.status,
      scenarioRunId: outcome.scenarioRunId,
      finishedAt: nowIso(),
      errorMessage: outcome.errorMessage,
    });

    collectionRunRepository.updateCollectionRun(runId, {
      passedCount,
      failedCount,
      skippedCount,
      durationMs: Date.now() - startedMs,
    });
  };

  const workers = Array.from({ length: parallelism }, async () => {
    while (nextIndex < items.length) {
      if (cancelFlags.get(runId)) break;
      const current = items[nextIndex];
      nextIndex += 1;
      await runOne(current);
    }
  });

  await Promise.all(workers);

  if (cancelFlags.get(runId)) {
    for (let i = nextIndex; i < items.length; i += 1) {
      const pending = items[i];
      if (pending.status === 'queued') {
        collectionRunRepository.updateCollectionRunItem(pending.id, {
          status: 'skipped',
          finishedAt: nowIso(),
          errorMessage: 'Cancelled',
        });
        skippedCount += 1;
      }
    }
  }

  const finalRun = collectionRunRepository.getCollectionRunById(runId);
  const total = finalRun?.totalTests || items.length;
  const status = cancelFlags.get(runId)
    ? 'cancelled'
    : computeRunStatus(passedCount, failedCount, skippedCount, total);

  const failedItems = (finalRun?.items || []).filter(
    (item) => item.status !== 'passed' && item.status !== 'skipped' && item.status !== 'queued'
  );

  collectionRunRepository.updateCollectionRun(runId, {
    status,
    passedCount,
    failedCount,
    skippedCount,
    finishedAt: nowIso(),
    durationMs: Date.now() - startedMs,
    result: {
      passRate: passRate(passedCount, total - skippedCount),
      failedTests: failedItems.map((item) => ({
        scenarioId: item.scenarioId,
        scenarioName: item.scenarioName,
        status: item.status,
        scenarioRunId: item.scenarioRunId,
        errorMessage: item.errorMessage,
      })),
    },
  });

  cancelFlags.delete(runId);
}

function startCollectionRun(collectionId, scenarioIds = [], options = {}) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) throw new Error('Collection not found.');

  const allowed = new Set(scenarioIds.map((id) => parseInt(id, 10)));
  const scenarios = scenarioRepository
    .getScenariosByCollectionId(collectionId)
    .filter((scenario) => allowed.has(scenario.id));

  if (scenarios.length === 0) {
    throw new Error('No valid tests selected for this collection run.');
  }

  const parallelism = Math.min(Math.max(parseInt(options.parallelism, 10) || 2, 1), 4);
  const run = collectionRunRepository.createCollectionRun(collectionId, scenarios, parallelism);

  setImmediate(() => {
    executeCollectionRun(run.id).catch((error) => {
      console.error(`Collection run ${run.id} failed:`, error.message);
      collectionRunRepository.updateCollectionRun(run.id, {
        status: 'failed',
        finishedAt: nowIso(),
        result: { error: error.message },
      });
      cancelFlags.delete(run.id);
    });
  });

  return run;
}

function getCollectionRun(runId) {
  return collectionRunRepository.getCollectionRunById(runId);
}

function getCollectionRuns(collectionId, limit = 20) {
  return collectionRunRepository.getCollectionRuns(collectionId, limit);
}

function cancelCollectionRun(runId) {
  const run = collectionRunRepository.getCollectionRunById(runId, false);
  if (!run) throw new Error('Collection run not found.');
  if (!['queued', 'running'].includes(run.status)) {
    return run;
  }
  cancelFlags.set(runId, true);
  return collectionRunRepository.getCollectionRunById(runId);
}

function getRunningItemNames(runId) {
  return (collectionRunRepository.getCollectionRunItems(runId) || [])
    .filter((item) => item.status === 'running')
    .map((item) => item.scenarioName);
}

function formatRunProgress(run) {
  if (!run) return null;
  const completed = (run.passedCount || 0) + (run.failedCount || 0) + (run.skippedCount || 0);
  const progressPercent = run.totalTests ? Math.round((completed / run.totalTests) * 100) : 0;
  const startedAtMs = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const elapsedMs = startedAtMs ? Date.now() - startedAtMs : run.durationMs || 0;

  return {
    ...run,
    progressPercent,
    completedCount: completed,
    elapsedMs,
    runningTests: getRunningItemNames(run.id),
  };
}

module.exports = {
  startCollectionRun,
  getCollectionRun,
  getCollectionRuns,
  cancelCollectionRun,
  formatRunProgress,
  executeCollectionRun,
};
