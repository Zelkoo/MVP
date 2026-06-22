const db = require('../../db/database');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToJob(row) {
  if (!row) return null;
  const result = parseJson(row.result_json, {});
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    url: row.url,
    collectionId: row.collection_id,
    progressPercent: row.progress_percent,
    currentStage: row.current_stage,
    currentMessage: row.current_message,
    totalPagesDiscovered: row.total_pages_discovered,
    pagesAnalyzed: row.pages_analyzed,
    totalActionsFound: row.total_actions_found,
    actionsProbed: row.actions_probed,
    hoverActionsProbed: row.hover_actions_probed,
    clickActionsProbed: row.click_actions_probed,
    suggestionsFound: row.suggestions_found,
    warnings: parseJson(row.warnings_json, []),
    errorMessage: row.error_message,
    request: parseJson(row.request_json, {}),
    result: result,
    partialSuggestions: result?.partialSuggestions || [],
    pagesFailed: result?.pagesFailed || [],
    skippedActions: result?.skippedActions || [],
    createdAt: row.created_at,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

function createJob({ url, request = {} }) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
      INSERT INTO discovery_jobs (type, status, url, request_json, updated_at)
      VALUES ('test-discovery', 'queued', @url, @requestJson, @updatedAt)
    `
    )
    .run({
      url,
      requestJson: JSON.stringify(request),
      updatedAt: now,
    });

  return getJobById(result.lastInsertRowid);
}

function getJobById(id) {
  const row = db.prepare('SELECT * FROM discovery_jobs WHERE id = ?').get(id);
  return rowToJob(row);
}

function markRunning(id) {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE discovery_jobs SET
      status = 'running',
      started_at = COALESCE(started_at, @now),
      current_stage = 'queued',
      current_message = 'Starting discovery…',
      updated_at = @now
    WHERE id = @id
  `
  ).run({ id, now });
  return getJobById(id);
}

function updateJob(id, patch) {
  const existing = getJobById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const warnings =
    patch.warnings !== undefined ? patch.warnings : existing.warnings || [];
  const resultJson =
    patch.result !== undefined
      ? JSON.stringify(patch.result)
      : existing.result
        ? JSON.stringify(existing.result)
        : null;

  db.prepare(
    `
    UPDATE discovery_jobs SET
      status = @status,
      collection_id = @collectionId,
      progress_percent = @progressPercent,
      current_stage = @currentStage,
      current_message = @currentMessage,
      total_pages_discovered = @totalPagesDiscovered,
      pages_analyzed = @pagesAnalyzed,
      total_actions_found = @totalActionsFound,
      actions_probed = @actionsProbed,
      hover_actions_probed = @hoverActionsProbed,
      click_actions_probed = @clickActionsProbed,
      suggestions_found = @suggestionsFound,
      warnings_json = @warningsJson,
      error_message = @errorMessage,
      result_json = @resultJson,
      updated_at = @now,
      finished_at = @finishedAt
    WHERE id = @id
  `
  ).run({
    id,
    status: patch.status !== undefined ? patch.status : existing.status,
    collectionId:
      patch.collectionId !== undefined ? patch.collectionId : existing.collectionId,
    progressPercent:
      patch.progressPercent !== undefined ? patch.progressPercent : existing.progressPercent,
    currentStage:
      patch.currentStage !== undefined ? patch.currentStage : existing.currentStage,
    currentMessage:
      patch.currentMessage !== undefined ? patch.currentMessage : existing.currentMessage,
    totalPagesDiscovered:
      patch.totalPagesDiscovered !== undefined
        ? patch.totalPagesDiscovered
        : existing.totalPagesDiscovered,
    pagesAnalyzed:
      patch.pagesAnalyzed !== undefined ? patch.pagesAnalyzed : existing.pagesAnalyzed,
    totalActionsFound:
      patch.totalActionsFound !== undefined
        ? patch.totalActionsFound
        : existing.totalActionsFound,
    actionsProbed:
      patch.actionsProbed !== undefined ? patch.actionsProbed : existing.actionsProbed,
    hoverActionsProbed:
      patch.hoverActionsProbed !== undefined
        ? patch.hoverActionsProbed
        : existing.hoverActionsProbed,
    clickActionsProbed:
      patch.clickActionsProbed !== undefined
        ? patch.clickActionsProbed
        : existing.clickActionsProbed,
    suggestionsFound:
      patch.suggestionsFound !== undefined
        ? patch.suggestionsFound
        : existing.suggestionsFound,
    warningsJson: JSON.stringify(warnings),
    errorMessage:
      patch.errorMessage !== undefined ? patch.errorMessage : existing.errorMessage,
    resultJson,
    now,
    finishedAt: patch.finishedAt !== undefined ? patch.finishedAt : existing.finishedAt,
  });

  return getJobById(id);
}

function markCancelled(id) {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE discovery_jobs SET
      status = 'cancelled',
      current_stage = 'cancelled',
      current_message = 'Discovery cancelled.',
      finished_at = @now,
      updated_at = @now
    WHERE id = @id AND status IN ('queued', 'running')
  `
  ).run({ id, now });
  return getJobById(id);
}

module.exports = {
  createJob,
  getJobById,
  markRunning,
  updateJob,
  markCancelled,
  rowToJob,
};
