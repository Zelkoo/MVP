const db = require('../db/database');
const { enrichIssues } = require('../utils/scanMetrics');

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToScenario(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    startUrl: row.start_url,
    config: parseJson(row.config_json),
    createdAt: row.created_at,
    collectionId: row.collection_id || null,
    sourceUrl: row.source_url || null,
    generatedBy: row.generated_by || 'manual',
    testSignature: row.test_signature || null,
    metadata: parseJson(row.metadata_json),
    isDeleted: Boolean(row.is_deleted),
  };
}

function rowToScenarioRun(row) {
  const result = parseJson(row.result_json, {});
  const enrichedIssues = enrichIssues(result.issues || []);

  return {
    id: row.id,
    scenarioId: row.scenario_id,
    status: row.status,
    score: row.score,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    screenshotPath: row.screenshot_path,
    videoPath: row.video_path || null,
    result: {
      ...result,
      issues: enrichedIssues,
    },
  };
}

function getAllScenarios() {
  const rows = db
    .prepare(`SELECT * FROM scenarios WHERE is_deleted = 0 ORDER BY created_at DESC`)
    .all();
  return rows.map(rowToScenario);
}

function getScenariosByCollectionId(collectionId) {
  const rows = db
    .prepare(
      `
      SELECT s.*,
        (
          SELECT sr.status FROM scenario_runs sr
          WHERE sr.scenario_id = s.id
          ORDER BY sr.started_at DESC LIMIT 1
        ) AS last_run_status,
        (
          SELECT sr.started_at FROM scenario_runs sr
          WHERE sr.scenario_id = s.id
          ORDER BY sr.started_at DESC LIMIT 1
        ) AS last_run_at
      FROM scenarios s
      WHERE s.collection_id = ? AND s.is_deleted = 0
      ORDER BY s.source_url ASC, s.created_at DESC
    `
    )
    .all(collectionId);

  return rows.map((row) => ({
    ...rowToScenario(row),
    lastRunStatus: row.last_run_status || null,
    lastRunAt: row.last_run_at || null,
  }));
}

function getScenarioById(id, includeDeleted = false) {
  const row = db
    .prepare(`SELECT * FROM scenarios WHERE id = ? ${includeDeleted ? '' : 'AND is_deleted = 0'}`)
    .get(id);
  return row ? rowToScenario(row) : null;
}

function findScenarioBySignature(collectionId, testSignature) {
  if (!testSignature) return null;
  const row = db
    .prepare(
      `
      SELECT * FROM scenarios
      WHERE collection_id = ? AND test_signature = ? AND is_deleted = 0
    `
    )
    .get(collectionId, testSignature);
  return row ? rowToScenario(row) : null;
}

function createScenario(data) {
  const result = db
    .prepare(
      `
      INSERT INTO scenarios (
        name, type, start_url, config_json,
        collection_id, source_url, generated_by, test_signature, metadata_json
      ) VALUES (
        @name, @type, @startUrl, @configJson,
        @collectionId, @sourceUrl, @generatedBy, @testSignature, @metadataJson
      )
    `
    )
    .run({
      name: data.name,
      type: data.type,
      startUrl: data.startUrl,
      configJson: JSON.stringify(data.config || {}),
      collectionId: data.collectionId || null,
      sourceUrl: data.sourceUrl || null,
      generatedBy: data.generatedBy || 'manual',
      testSignature: data.testSignature || null,
      metadataJson: JSON.stringify(data.metadata || {}),
    });

  return getScenarioById(result.lastInsertRowid);
}

function deleteScenario(id, options = {}) {
  const existing = getScenarioById(id, true);
  if (!existing) return false;

  if (options.hard) {
    db.prepare('DELETE FROM scenarios WHERE id = ?').run(id);
  } else {
    db.prepare('UPDATE scenarios SET is_deleted = 1 WHERE id = ?').run(id);
  }
  return true;
}

function createScenarioRun(scenarioId, runData) {
  const result = db
    .prepare(
      `
      INSERT INTO scenario_runs (
        scenario_id, status, score, started_at, finished_at, result_json, screenshot_path, video_path
      ) VALUES (
        @scenarioId, @status, @score, datetime('now'), datetime('now'), @resultJson, @screenshotPath, @videoPath
      )
    `
    )
    .run({
      scenarioId,
      status: runData.status,
      score: runData.score,
      resultJson: JSON.stringify(runData.result || {}),
      screenshotPath: runData.screenshotPath || null,
      videoPath: runData.videoPath || null,
    });

  return getScenarioRunById(result.lastInsertRowid);
}

function getScenarioRunById(id) {
  const row = db.prepare('SELECT * FROM scenario_runs WHERE id = ?').get(id);
  if (!row) return null;

  const run = rowToScenarioRun(row);
  const scenario = getScenarioById(row.scenario_id);
  if (scenario) {
    run.scenario = scenario;
  }
  return run;
}

module.exports = {
  getAllScenarios,
  getScenariosByCollectionId,
  getScenarioById,
  findScenarioBySignature,
  createScenario,
  deleteScenario,
  createScenarioRun,
  getScenarioRunById,
};
