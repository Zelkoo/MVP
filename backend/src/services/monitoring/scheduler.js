const monitoringRepository = require('./monitoringRepository');
const { executeMonitoringFlow } = require('./flowExecutor');
const { evaluateFlowAlerts } = require('./flowAlertService');

let timer = null;
let running = false;

async function runFlowAndRecord(flow) {
  const statsBefore = monitoringRepository.getFlowStats(flow.id);
  const previousStatus = statsBefore.lastRun?.status || null;
  const startedAt = new Date().toISOString();

  let run;
  try {
    const outcome = await executeMonitoringFlow(flow);
    run = monitoringRepository.createFlowRun(flow.id, {
      status: outcome.status,
      score: outcome.score,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: outcome.durationMs,
      result: outcome.result,
      screenshotPath: outcome.screenshotPath,
      failureReason: outcome.failureReason,
    });
    monitoringRepository.markFlowRunComplete(flow.id, flow.schedule);
  } catch (error) {
    run = monitoringRepository.createFlowRun(flow.id, {
      status: 'error',
      score: 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      result: {
        steps: [{ name: 'Run flow', status: 'failed', message: error.message }],
        issues: [],
        consoleErrors: [],
        summary: error.message,
      },
      screenshotPath: null,
      failureReason: error.message,
    });
    monitoringRepository.markFlowRunComplete(flow.id, flow.schedule);
  }

  const refreshedFlow = monitoringRepository.getFlowById(flow.id);
  const project = monitoringRepository.getProjectById(flow.projectId);
  try {
    await evaluateFlowAlerts({
      flow: refreshedFlow,
      project,
      previousStatus,
      currentRun: run,
    });
  } catch (alertError) {
    console.error(`[scheduler] Alert evaluation failed for flow #${flow.id}:`, alertError.message);
  }

  return run;
}

async function tick() {
  if (running) return;
  running = true;

  try {
    const dueFlows = monitoringRepository.getDueFlows();
    for (const flow of dueFlows) {
      console.log(`[scheduler] Running scheduled flow #${flow.id} (${flow.name})`);
      await runFlowAndRecord(flow);
    }
  } catch (error) {
    console.error('[scheduler] Tick failed:', error.message);
  } finally {
    running = false;
  }
}

function startScheduler(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 5_000);
  console.log(`[scheduler] Monitoring scheduler started (every ${intervalMs / 1000}s)`);
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runFlowAndRecord,
  tick,
};
