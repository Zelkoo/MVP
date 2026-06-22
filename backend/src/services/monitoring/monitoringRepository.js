const db = require('../../db/database');
const { computeNextRunAt } = require('./scheduleUtils');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToProject(row) {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    createdAt: row.created_at,
  };
}

function rowToFlow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    startUrl: row.start_url,
    steps: parseJson(row.steps_json, []),
    successConditions: parseJson(row.success_conditions_json, []),
    schedule: row.schedule,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    alertEmail: row.alert_email || null,
    alertOnFailure: row.alert_on_failure == null ? true : Boolean(row.alert_on_failure),
    alertOnRecovery: row.alert_on_recovery == null ? true : Boolean(row.alert_on_recovery),
    failureThreshold: row.failure_threshold ?? 1,
    lastAlertSentAt: row.last_alert_sent_at || null,
    lastAlertStatus: row.last_alert_status || null,
    consecutiveFailureCount: row.consecutive_failure_count || 0,
  };
}

function rowToFlowRun(row) {
  return {
    id: row.id,
    flowId: row.flow_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    result: parseJson(row.result_json, {}),
    screenshotPath: row.screenshot_path,
    failureReason: row.failure_reason,
    score: row.score,
  };
}

function getFlowStats(flowId) {
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS totalRuns,
        SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS passedRuns,
        AVG(duration_ms) AS avgDurationMs
      FROM flow_runs
      WHERE flow_id = ?
    `
    )
    .get(flowId);

  const lastRunRow = db
    .prepare(
      `
      SELECT * FROM flow_runs
      WHERE flow_id = ?
      ORDER BY started_at DESC
      LIMIT 1
    `
    )
    .get(flowId);

  const lastFailureRow = db
    .prepare(
      `
      SELECT * FROM flow_runs
      WHERE flow_id = ? AND status != 'passed'
      ORDER BY started_at DESC
      LIMIT 1
    `
    )
    .get(flowId);

  const totalRuns = totals?.totalRuns || 0;
  const passedRuns = totals?.passedRuns || 0;
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : null;

  return {
    totalRuns,
    passedRuns,
    passRate,
    avgDurationMs: totals?.avgDurationMs ? Math.round(totals.avgDurationMs) : null,
    lastRun: lastRunRow ? rowToFlowRun(lastRunRow) : null,
    lastFailure: lastFailureRow ? rowToFlowRun(lastFailureRow) : null,
  };
}

function getProjectStats(projectId) {
  const flows = getFlowsByProjectId(projectId);
  const flowStats = flows.map((flow) => ({ flowId: flow.id, ...getFlowStats(flow.id) }));

  const totalRuns = flowStats.reduce((sum, entry) => sum + entry.totalRuns, 0);
  const passedRuns = flowStats.reduce((sum, entry) => sum + entry.passedRuns, 0);
  const passRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : null;

  const lastFailure = db
    .prepare(
      `
      SELECT fr.* FROM flow_runs fr
      JOIN flows f ON f.id = fr.flow_id
      WHERE f.project_id = ? AND fr.status != 'passed'
      ORDER BY fr.started_at DESC
      LIMIT 1
    `
    )
    .get(projectId);

  return {
    flowCount: flows.length,
    activeFlowCount: flows.filter((flow) => flow.isActive).length,
    totalRuns,
    passRate,
    lastFailure: lastFailure ? rowToFlowRun(lastFailure) : null,
    flows: flowStats,
  };
}

function getAllProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().map(rowToProject);
}

function getProjectById(id) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return row ? rowToProject(row) : null;
}

function createProject(data) {
  const result = db
    .prepare(
      `
      INSERT INTO projects (name, domain)
      VALUES (@name, @domain)
    `
    )
    .run({
      name: data.name.trim(),
      domain: data.domain.trim(),
    });

  return getProjectById(result.lastInsertRowid);
}

function getFlowsByProjectId(projectId) {
  return db
    .prepare('SELECT * FROM flows WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId)
    .map(rowToFlow);
}

function getFlowById(id) {
  const row = db.prepare('SELECT * FROM flows WHERE id = ?').get(id);
  return row ? rowToFlow(row) : null;
}

function createFlow(data) {
  const nextRunAt = data.schedule && data.schedule !== 'manual' ? computeNextRunAt(data.schedule) : null;

  const result = db
    .prepare(
      `
      INSERT INTO flows (
        project_id, name, start_url, steps_json, success_conditions_json,
        schedule, is_active, next_run_at,
        alert_email, alert_on_failure, alert_on_recovery, failure_threshold
      ) VALUES (
        @projectId, @name, @startUrl, @stepsJson, @successConditionsJson,
        @schedule, @isActive, @nextRunAt,
        @alertEmail, @alertOnFailure, @alertOnRecovery, @failureThreshold
      )
    `
    )
    .run({
      projectId: data.projectId,
      name: data.name.trim(),
      startUrl: data.startUrl.trim(),
      stepsJson: JSON.stringify(data.steps || []),
      successConditionsJson: JSON.stringify(data.successConditions || []),
      schedule: data.schedule || 'manual',
      isActive: data.isActive === false ? 0 : 1,
      nextRunAt,
      alertEmail: data.alertEmail || null,
      alertOnFailure: data.alertOnFailure === false ? 0 : 1,
      alertOnRecovery: data.alertOnRecovery === false ? 0 : 1,
      failureThreshold: Math.max(parseInt(data.failureThreshold, 10) || 1, 1),
    });

  return getFlowById(result.lastInsertRowid);
}

function updateFlow(id, patch) {
  const existing = getFlowById(id);
  if (!existing) return null;

  const schedule = patch.schedule !== undefined ? patch.schedule : existing.schedule;
  const isActive = patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0;
  const nextRunAt =
    patch.schedule !== undefined
      ? schedule !== 'manual'
        ? computeNextRunAt(schedule)
        : null
      : existing.nextRunAt;

  db.prepare(
    `
    UPDATE flows SET
      name = @name,
      start_url = @startUrl,
      steps_json = @stepsJson,
      success_conditions_json = @successConditionsJson,
      schedule = @schedule,
      is_active = @isActive,
      next_run_at = @nextRunAt,
      alert_email = @alertEmail,
      alert_on_failure = @alertOnFailure,
      alert_on_recovery = @alertOnRecovery,
      failure_threshold = @failureThreshold
    WHERE id = @id
  `
  ).run({
    id,
    name: (patch.name !== undefined ? patch.name : existing.name).trim(),
    startUrl: (patch.startUrl !== undefined ? patch.startUrl : existing.startUrl).trim(),
    stepsJson: JSON.stringify(patch.steps !== undefined ? patch.steps : existing.steps),
    successConditionsJson: JSON.stringify(
      patch.successConditions !== undefined ? patch.successConditions : existing.successConditions
    ),
    schedule,
    isActive,
    nextRunAt,
    alertEmail: patch.alertEmail !== undefined ? patch.alertEmail || null : existing.alertEmail,
    alertOnFailure:
      patch.alertOnFailure !== undefined ? (patch.alertOnFailure ? 1 : 0) : existing.alertOnFailure ? 1 : 0,
    alertOnRecovery:
      patch.alertOnRecovery !== undefined ? (patch.alertOnRecovery ? 1 : 0) : existing.alertOnRecovery ? 1 : 0,
    failureThreshold:
      patch.failureThreshold !== undefined
        ? Math.max(parseInt(patch.failureThreshold, 10) || 1, 1)
        : existing.failureThreshold || 1,
  });

  return getFlowById(id);
}

function updateFlowAlertState(flowId, patch) {
  const existing = getFlowById(flowId);
  if (!existing) return null;

  db.prepare(
    `
    UPDATE flows SET
      last_alert_sent_at = COALESCE(@lastAlertSentAt, last_alert_sent_at),
      last_alert_status = COALESCE(@lastAlertStatus, last_alert_status),
      consecutive_failure_count = COALESCE(@consecutiveFailureCount, consecutive_failure_count)
    WHERE id = @id
  `
  ).run({
    id: flowId,
    lastAlertSentAt: patch.lastAlertSentAt ?? null,
    lastAlertStatus: patch.lastAlertStatus ?? null,
    consecutiveFailureCount:
      patch.consecutiveFailureCount !== undefined ? patch.consecutiveFailureCount : null,
  });

  return getFlowById(flowId);
}

function createFlowRun(flowId, runData) {
  const result = db
    .prepare(
      `
      INSERT INTO flow_runs (
        flow_id, status, started_at, finished_at, duration_ms,
        result_json, screenshot_path, failure_reason, score
      ) VALUES (
        @flowId, @status, @startedAt, @finishedAt, @durationMs,
        @resultJson, @screenshotPath, @failureReason, @score
      )
    `
    )
    .run({
      flowId,
      status: runData.status,
      startedAt: runData.startedAt || new Date().toISOString(),
      finishedAt: runData.finishedAt || new Date().toISOString(),
      durationMs: runData.durationMs || 0,
      resultJson: JSON.stringify(runData.result || {}),
      screenshotPath: runData.screenshotPath || null,
      failureReason: runData.failureReason || null,
      score: runData.score || 0,
    });

  return getFlowRunById(result.lastInsertRowid);
}

function markFlowRunComplete(flowId, schedule) {
  const finishedAt = new Date();
  db.prepare(
    `
    UPDATE flows
    SET last_run_at = @lastRunAt, next_run_at = @nextRunAt
    WHERE id = @flowId
  `
  ).run({
    flowId,
    lastRunAt: finishedAt.toISOString(),
    nextRunAt: schedule && schedule !== 'manual' ? computeNextRunAt(schedule, finishedAt) : null,
  });
}

function getFlowRunById(id) {
  const row = db.prepare('SELECT * FROM flow_runs WHERE id = ?').get(id);
  if (!row) return null;
  const run = rowToFlowRun(row);
  run.flow = getFlowById(row.flow_id);
  return run;
}

function getFlowRuns(flowId, limit = 50) {
  return db
    .prepare(
      `
      SELECT * FROM flow_runs
      WHERE flow_id = ?
      ORDER BY started_at DESC
      LIMIT ?
    `
    )
    .all(flowId, limit)
    .map(rowToFlowRun);
}

function getProjectRecentRuns(projectId, limit = 30) {
  return db
    .prepare(
      `
      SELECT fr.*, f.name AS flow_name
      FROM flow_runs fr
      JOIN flows f ON f.id = fr.flow_id
      WHERE f.project_id = ?
      ORDER BY fr.started_at DESC
      LIMIT ?
    `
    )
    .all(projectId, limit)
    .map((row) => ({
      ...rowToFlowRun(row),
      flowName: row.flow_name,
    }));
}

function getDueFlows() {
  return db
    .prepare(
      `
      SELECT * FROM flows
      WHERE is_active = 1
        AND schedule != 'manual'
        AND (next_run_at IS NULL OR next_run_at <= datetime('now'))
      ORDER BY COALESCE(next_run_at, created_at) ASC
      LIMIT 10
    `
    )
    .all()
    .map(rowToFlow);
}

function hasMonitoringFlowMatchingScenario(scenario) {
  if (!scenario?.name || !scenario?.startUrl) return false;
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM flows
      WHERE name = ? AND start_url = ?
    `
    )
    .get(scenario.name, scenario.startUrl);
  return (row?.count || 0) > 0;
}

function findFlowByScenarioInProject(projectId, scenario) {
  if (!scenario?.name || !scenario?.startUrl) return null;
  const row = db
    .prepare(
      `
      SELECT * FROM flows
      WHERE project_id = ? AND name = ? AND start_url = ?
      LIMIT 1
    `
    )
    .get(projectId, scenario.name, scenario.startUrl);
  return row ? rowToFlow(row) : null;
}

function buildMonitoredTestsMap(projectId, scenarios = []) {
  const map = {};
  if (!projectId) return map;

  for (const scenario of scenarios) {
    if (!scenario?.id) continue;
    const flow = findFlowByScenarioInProject(projectId, scenario);
    if (flow) {
      map[String(scenario.id)] = {
        flowId: flow.id,
        schedule: flow.schedule,
        isActive: flow.isActive,
      };
    }
  }

  return map;
}

function createFlowFromScenario(projectId, scenario) {
  const steps = scenario.config?.steps || [];
  const assertionActions = new Set(['waitForText', 'expectUrlContains', 'expectVisible', 'expectNetworkSuccess']);
  const actionSteps = steps.filter((step) => !assertionActions.has(step.action) && step.action !== 'screenshot');
  const successConditions = steps.filter((step) => assertionActions.has(step.action));

  return createFlow({
    projectId,
    name: scenario.name,
    startUrl: scenario.startUrl,
    steps: actionSteps,
    successConditions,
    schedule: 'manual',
    isActive: true,
  });
}

module.exports = {
  getAllProjects,
  getProjectById,
  createProject,
  getProjectStats,
  getFlowsByProjectId,
  getFlowById,
  createFlow,
  updateFlow,
  updateFlowAlertState,
  createFlowRun,
  markFlowRunComplete,
  getFlowRunById,
  getFlowRuns,
  getProjectRecentRuns,
  getFlowStats,
  getDueFlows,
  createFlowFromScenario,
  hasMonitoringFlowMatchingScenario,
  findFlowByScenarioInProject,
  buildMonitoredTestsMap,
};
