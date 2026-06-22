const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const dataDir = config.dataDir;
const dbPath = path.join(dataDir, 'qa-agent.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    final_url TEXT,
    title TEXT,
    status_code INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    load_duration_ms INTEGER,
    total_requests INTEGER DEFAULT 0,
    failed_requests_count INTEGER DEFAULT 0,
    desktop_screenshot_path TEXT,
    mobile_screenshot_path TEXT,
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    score INTEGER DEFAULT 100,
    critical_count INTEGER DEFAULT 0,
    warning_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,
    broken_links_count INTEGER DEFAULT 0,
    report_json TEXT
  );

  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,
    source TEXT,
    label TEXT,
    description TEXT,
    recommendation TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_issues_scan_id ON issues(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

  CREATE TABLE IF NOT EXISTS scan_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL,
    page_order INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL,
    final_url TEXT,
    title TEXT,
    status_code INTEGER,
    load_duration_ms INTEGER,
    total_requests INTEGER DEFAULT 0,
    failed_requests_count INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scan_pages_scan_id ON scan_pages(scan_id);

  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    start_url TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scenario_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'error',
    score INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    result_json TEXT,
    screenshot_path TEXT,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scenario_runs_scenario_id ON scenario_runs(scenario_id);

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    start_url TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    success_conditions_json TEXT NOT NULL DEFAULT '[]',
    schedule TEXT NOT NULL DEFAULT 'manual',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_run_at TEXT,
    next_run_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_flows_project_id ON flows(project_id);
  CREATE INDEX IF NOT EXISTS idx_flows_next_run_at ON flows(next_run_at);

  CREATE TABLE IF NOT EXISTS flow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'error',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    result_json TEXT,
    screenshot_path TEXT,
    failure_reason TEXT,
    score INTEGER DEFAULT 0,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_id ON flow_runs(flow_id);
  CREATE INDEX IF NOT EXISTS idx_flow_runs_started_at ON flow_runs(started_at DESC);

  CREATE TABLE IF NOT EXISTS test_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    origin TEXT NOT NULL,
    start_url TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_analyzed_at TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT DEFAULT '{}'
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_test_collections_origin ON test_collections(origin) WHERE is_deleted = 0;
  CREATE INDEX IF NOT EXISTS idx_test_collections_domain ON test_collections(domain);

  CREATE TABLE IF NOT EXISTS discovery_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'test-discovery',
    status TEXT NOT NULL DEFAULT 'queued',
    url TEXT NOT NULL,
    collection_id INTEGER,
    progress_percent INTEGER NOT NULL DEFAULT 0,
    current_stage TEXT,
    current_message TEXT,
    total_pages_discovered INTEGER NOT NULL DEFAULT 0,
    pages_analyzed INTEGER NOT NULL DEFAULT 0,
    total_actions_found INTEGER NOT NULL DEFAULT 0,
    actions_probed INTEGER NOT NULL DEFAULT 0,
    hover_actions_probed INTEGER NOT NULL DEFAULT 0,
    click_actions_probed INTEGER NOT NULL DEFAULT 0,
    suggestions_found INTEGER NOT NULL DEFAULT 0,
    warnings_json TEXT NOT NULL DEFAULT '[]',
    error_message TEXT,
    request_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_discovery_jobs_status ON discovery_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_discovery_jobs_created_at ON discovery_jobs(created_at DESC);

  CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER NOT NULL REFERENCES test_collections(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    parallelism INTEGER NOT NULL DEFAULT 2,
    started_at TEXT,
    finished_at TEXT,
    duration_ms INTEGER,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS collection_run_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_run_id INTEGER NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
    scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    scenario_run_id INTEGER REFERENCES scenario_runs(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    scenario_name TEXT,
    started_at TEXT,
    finished_at TEXT,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_collection_runs_collection_id ON collection_runs(collection_id);
  CREATE INDEX IF NOT EXISTS idx_collection_runs_created_at ON collection_runs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collection_run_items_run_id ON collection_run_items(collection_run_id);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('scans', 'score', 'INTEGER DEFAULT 100');
ensureColumn('scans', 'critical_count', 'INTEGER DEFAULT 0');
ensureColumn('scans', 'warning_count', 'INTEGER DEFAULT 0');
ensureColumn('scans', 'info_count', 'INTEGER DEFAULT 0');
ensureColumn('scans', 'broken_links_count', 'INTEGER DEFAULT 0');
ensureColumn('scans', 'report_json', 'TEXT');
ensureColumn('issues', 'label', 'TEXT');
ensureColumn('issues', 'description', 'TEXT');
ensureColumn('issues', 'recommendation', 'TEXT');
ensureColumn('issues', 'scan_page_id', 'INTEGER');
ensureColumn('issues', 'page_url', 'TEXT');
ensureColumn('scans', 'public_token', 'TEXT');

ensureColumn('scenarios', 'collection_id', 'INTEGER');
ensureColumn('scenarios', 'source_url', 'TEXT');
ensureColumn('scenarios', 'generated_by', "TEXT DEFAULT 'manual'");
ensureColumn('scenarios', 'test_signature', 'TEXT');
ensureColumn('scenarios', 'metadata_json', "TEXT DEFAULT '{}'");
ensureColumn('scenarios', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('scenario_runs', 'video_path', 'TEXT');

ensureColumn('flows', 'alert_email', 'TEXT');
ensureColumn('flows', 'alert_on_failure', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('flows', 'alert_on_recovery', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('flows', 'failure_threshold', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('flows', 'last_alert_sent_at', 'TEXT');
ensureColumn('flows', 'last_alert_status', 'TEXT');
ensureColumn('flows', 'consecutive_failure_count', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_scenarios_collection_id ON scenarios(collection_id);
  CREATE INDEX IF NOT EXISTS idx_scenarios_test_signature ON scenarios(test_signature);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_scenarios_collection_signature
    ON scenarios(collection_id, test_signature) WHERE is_deleted = 0 AND test_signature IS NOT NULL;
`);

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_public_token ON scans(public_token)');

const { generatePublicToken } = require('../utils/token');

function backfillPublicTokens() {
  const rows = db
    .prepare(`SELECT id FROM scans WHERE public_token IS NULL OR public_token = ''`)
    .all();
  const update = db.prepare('UPDATE scans SET public_token = ? WHERE id = ?');

  for (const row of rows) {
    update.run(generatePublicToken(), row.id);
  }
}

backfillPublicTokens();

const { enrichIssues, computeScore, computeScanStats } = require('../utils/scanMetrics');

function backfillScanMetrics() {
  const staleScans = db
    .prepare(`
      SELECT s.id, s.failed_requests_count
      FROM scans s
      WHERE EXISTS (SELECT 1 FROM issues i WHERE i.scan_id = s.id)
        AND (
          s.score IS NULL
          OR (s.critical_count = 0 AND s.warning_count = 0 AND s.info_count = 0)
        )
    `)
    .all();

  if (staleScans.length === 0) {
    return;
  }

  const updateScan = db.prepare(`
    UPDATE scans
    SET score = @score,
        critical_count = @criticalCount,
        warning_count = @warningCount,
        info_count = @infoCount,
        broken_links_count = @brokenLinksCount
    WHERE id = @id
  `);

  const updateIssue = db.prepare(`
    UPDATE issues
    SET label = @label, description = @description, recommendation = @recommendation
    WHERE id = @id
  `);

  const getIssues = db.prepare('SELECT * FROM issues WHERE scan_id = ?');

  for (const scan of staleScans) {
    const rows = getIssues.all(scan.id);
    const rawIssues = rows.map((row) => ({
      type: row.type,
      severity: row.severity,
      message: row.message,
      details: row.details,
      source: row.source,
    }));
    const enrichedIssues = enrichIssues(rawIssues);
    const stats = computeScanStats(enrichedIssues, scan.failed_requests_count);

    updateScan.run({
      id: scan.id,
      score: computeScore(enrichedIssues),
      criticalCount: stats.criticalCount,
      warningCount: stats.warningCount,
      infoCount: stats.infoCount,
      brokenLinksCount: stats.brokenLinksCount,
    });

    rows.forEach((row, index) => {
      const enriched = enrichedIssues[index];
      if (!row.label || !row.recommendation) {
        updateIssue.run({
          id: row.id,
          label: enriched.label,
          description: enriched.description,
          recommendation: enriched.recommendation,
        });
      }
    });
  }
}

backfillScanMetrics();

module.exports = db;
