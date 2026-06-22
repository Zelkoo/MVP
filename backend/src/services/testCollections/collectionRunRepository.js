const db = require('../../db/database');

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToCollectionRun(row) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    status: row.status,
    totalTests: row.total_tests,
    passedCount: row.passed_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms || 0,
    parallelism: row.parallelism || 2,
    createdAt: row.created_at,
    result: parseJson(row.result_json),
  };
}

function rowToCollectionRunItem(row) {
  return {
    id: row.id,
    collectionRunId: row.collection_run_id,
    scenarioId: row.scenario_id,
    scenarioRunId: row.scenario_run_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    scenarioName: row.scenario_name,
  };
}

function createCollectionRun(collectionId, scenarioIds, parallelism = 2) {
  const result = db
    .prepare(
      `
      INSERT INTO collection_runs (
        collection_id, status, total_tests, parallelism, started_at
      ) VALUES (?, 'queued', ?, ?, datetime('now'))
    `
    )
    .run(collectionId, scenarioIds.length, Math.min(Math.max(parallelism, 1), 4));

  const runId = result.lastInsertRowid;
  const insertItem = db.prepare(
    `
    INSERT INTO collection_run_items (
      collection_run_id, scenario_id, status, scenario_name
    ) VALUES (?, ?, 'queued', ?)
  `
  );

  for (const scenario of scenarioIds) {
    insertItem.run(runId, scenario.id, scenario.name);
  }

  return getCollectionRunById(runId);
}

function getCollectionRunById(runId, includeItems = true) {
  const row = db.prepare('SELECT * FROM collection_runs WHERE id = ?').get(runId);
  if (!row) return null;

  const run = rowToCollectionRun(row);
  if (includeItems) {
    run.items = getCollectionRunItems(runId);
  }
  return run;
}

function getCollectionRunItems(runId) {
  return db
    .prepare(
      `
      SELECT * FROM collection_run_items
      WHERE collection_run_id = ?
      ORDER BY id ASC
    `
    )
    .all(runId)
    .map(rowToCollectionRunItem);
}

function getCollectionRuns(collectionId, limit = 20) {
  return db
    .prepare(
      `
      SELECT * FROM collection_runs
      WHERE collection_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `
    )
    .all(collectionId, limit)
    .map(rowToCollectionRun);
}

function getLatestCollectionRun(collectionId) {
  const row = db
    .prepare(
      `
      SELECT * FROM collection_runs
      WHERE collection_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `
    )
    .get(collectionId);
  return row ? rowToCollectionRun(row) : null;
}

function updateCollectionRun(runId, patch) {
  const existing = getCollectionRunById(runId, false);
  if (!existing) return null;

  db.prepare(
    `
    UPDATE collection_runs SET
      status = @status,
      passed_count = @passedCount,
      failed_count = @failedCount,
      skipped_count = @skippedCount,
      finished_at = @finishedAt,
      duration_ms = @durationMs,
      result_json = @resultJson
    WHERE id = @id
  `
  ).run({
    id: runId,
    status: patch.status !== undefined ? patch.status : existing.status,
    passedCount: patch.passedCount !== undefined ? patch.passedCount : existing.passedCount,
    failedCount: patch.failedCount !== undefined ? patch.failedCount : existing.failedCount,
    skippedCount: patch.skippedCount !== undefined ? patch.skippedCount : existing.skippedCount,
    finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
    durationMs: patch.durationMs !== undefined ? patch.durationMs : existing.durationMs,
    resultJson: JSON.stringify(patch.result !== undefined ? patch.result : existing.result || {}),
  });

  return getCollectionRunById(runId);
}

function updateCollectionRunItem(itemId, patch) {
  db.prepare(
    `
    UPDATE collection_run_items SET
      status = COALESCE(@status, status),
      scenario_run_id = COALESCE(@scenarioRunId, scenario_run_id),
      started_at = COALESCE(@startedAt, started_at),
      finished_at = COALESCE(@finishedAt, finished_at),
      error_message = COALESCE(@errorMessage, error_message)
    WHERE id = @id
  `
  ).run({
    id: itemId,
    status: patch.status ?? null,
    scenarioRunId: patch.scenarioRunId ?? null,
    startedAt: patch.startedAt ?? null,
    finishedAt: patch.finishedAt ?? null,
    errorMessage: patch.errorMessage ?? null,
  });
}

function countRunningItems(runId) {
  return (
    db
      .prepare(
        `
      SELECT COUNT(*) AS count FROM collection_run_items
      WHERE collection_run_id = ? AND status = 'running'
    `
      )
      .get(runId)?.count || 0
  );
}

function getCollectionSuiteStats(collectionId) {
  const collection = db.prepare('SELECT metadata_json FROM test_collections WHERE id = ?').get(collectionId);
  const metadata = parseJson(collection?.metadata_json, {});
  const monitoredCount = Array.isArray(metadata.monitoredScenarioIds)
    ? metadata.monitoredScenarioIds.length
    : 0;

  const failingCount =
    db
      .prepare(
        `
      SELECT COUNT(*) AS count FROM scenarios s
      WHERE s.collection_id = ? AND s.is_deleted = 0
        AND (
          SELECT sr.status FROM scenario_runs sr
          WHERE sr.scenario_id = s.id
          ORDER BY sr.started_at DESC LIMIT 1
        ) IN ('failed', 'error', 'partial')
    `
      )
      .get(collectionId)?.count || 0;

  const latest = getLatestCollectionRun(collectionId);
  let passRate = null;
  if (latest && latest.totalTests > 0 && ['passed', 'failed', 'partial'].includes(latest.status)) {
    passRate = Math.round((latest.passedCount / latest.totalTests) * 100);
  }

  return {
    lastCollectionRun: latest,
    lastPassRate: passRate,
    lastRunAt: latest?.finishedAt || latest?.startedAt || null,
    monitoredTestCount: monitoredCount,
    failingTestCount: failingCount,
  };
}

module.exports = {
  createCollectionRun,
  getCollectionRunById,
  getCollectionRunItems,
  getCollectionRuns,
  getLatestCollectionRun,
  updateCollectionRun,
  updateCollectionRunItem,
  countRunningItems,
  getCollectionSuiteStats,
};
