const db = require('../../db/database');

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToCollection(row) {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    origin: row.origin,
    startUrl: row.start_url,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAnalyzedAt: row.last_analyzed_at,
    metadata: parseJson(row.metadata_json),
  };
}

function getCollectionStats(collectionId) {
  const testCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM scenarios WHERE collection_id = ? AND is_deleted = 0`
    )
    .get(collectionId)?.count || 0;

  const lastRun = db
    .prepare(
      `
      SELECT sr.status, sr.started_at
      FROM scenario_runs sr
      JOIN scenarios s ON s.id = sr.scenario_id
      WHERE s.collection_id = ? AND s.is_deleted = 0
      ORDER BY sr.started_at DESC
      LIMIT 1
    `
    )
    .get(collectionId);

  return {
    testCount,
    lastRunStatus: lastRun?.status || null,
    lastRunAt: lastRun?.started_at || null,
  };
}

function getAllCollections() {
  return db
    .prepare(
      `SELECT * FROM test_collections WHERE is_deleted = 0 ORDER BY updated_at DESC`
    )
    .all()
    .map((row) => ({
      ...rowToCollection(row),
      ...getCollectionStats(row.id),
    }));
}

function getCollectionById(id, includeDeleted = false) {
  const row = db
    .prepare(
      `SELECT * FROM test_collections WHERE id = ? ${includeDeleted ? '' : 'AND is_deleted = 0'}`
    )
    .get(id);
  return row ? rowToCollection(row) : null;
}

function getCollectionByOrigin(origin) {
  const row = db
    .prepare(`SELECT * FROM test_collections WHERE origin = ? AND is_deleted = 0`)
    .get(origin);
  return row ? rowToCollection(row) : null;
}

function createCollection(data) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `
      INSERT INTO test_collections (
        name, domain, origin, start_url, description, last_analyzed_at, metadata_json, updated_at
      ) VALUES (
        @name, @domain, @origin, @startUrl, @description, @lastAnalyzedAt, @metadataJson, @updatedAt
      )
    `
    )
    .run({
      name: data.name,
      domain: data.domain,
      origin: data.origin,
      startUrl: data.startUrl,
      description: data.description || null,
      lastAnalyzedAt: data.lastAnalyzedAt || null,
      metadataJson: JSON.stringify(data.metadata || {}),
      updatedAt: now,
    });

  return getCollectionById(result.lastInsertRowid);
}

function updateCollection(id, patch) {
  const existing = getCollectionById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE test_collections SET
      name = @name,
      description = @description,
      last_analyzed_at = @lastAnalyzedAt,
      metadata_json = @metadataJson,
      updated_at = @updatedAt
    WHERE id = @id
  `
  ).run({
    id,
    name: patch.name !== undefined ? patch.name : existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    lastAnalyzedAt:
      patch.lastAnalyzedAt !== undefined ? patch.lastAnalyzedAt : existing.lastAnalyzedAt,
    metadataJson: JSON.stringify(
      patch.metadata !== undefined ? patch.metadata : existing.metadata
    ),
    updatedAt: now,
  });

  return getCollectionById(id);
}

function touchAnalyzed(id) {
  return updateCollection(id, { lastAnalyzedAt: new Date().toISOString() });
}

function softDeleteCollection(id) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE test_collections SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(
    now,
    id
  );
  db.prepare(
    `UPDATE scenarios SET is_deleted = 1 WHERE collection_id = ? AND generated_by != 'manual'`
  ).run(id);
}

function softDeleteCollectionAndAllTests(id) {
  const now = new Date().toISOString();
  db.prepare(`UPDATE test_collections SET is_deleted = 1, updated_at = ? WHERE id = ?`).run(
    now,
    id
  );
  db.prepare(`UPDATE scenarios SET is_deleted = 1 WHERE collection_id = ?`).run(id);
}

module.exports = {
  getAllCollections,
  getCollectionById,
  getCollectionByOrigin,
  createCollection,
  updateCollection,
  touchAnalyzed,
  softDeleteCollection,
  softDeleteCollectionAndAllTests,
  getCollectionStats,
  rowToCollection,
};
