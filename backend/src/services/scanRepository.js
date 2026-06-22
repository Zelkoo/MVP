const db = require('../db/database');
const { enrichIssues, computeScore, computeScanStats } = require('../utils/scanMetrics');
const { generatePublicToken } = require('../utils/token');
const { buildPublicReport } = require('../utils/publicReport');
function parseReport(row) {
  if (!row.report_json) return null;
  try {
    return JSON.parse(row.report_json);
  } catch {
    return null;
  }
}

function rowToPage(row, issues = []) {
  return {
    id: row.id,
    scanId: row.scan_id,
    order: row.page_order,
    url: row.url,
    finalUrl: row.final_url,
    title: row.title,
    statusCode: row.status_code,
    loadDurationMs: row.load_duration_ms,
    totalRequests: row.total_requests,
    failedRequestsCount: row.failed_requests_count,
    status: row.status,
    error: row.error_message,
    issues,
  };
}

function rowToScan(row, issues = [], pages = [], options = {}) {
  const enrichedIssues = enrichIssues(issues);
  const stats = computeScanStats(enrichedIssues, row.failed_requests_count);

  const scan = {
    id: row.id,
    url: row.url,
    finalUrl: row.final_url,
    title: row.title,
    statusCode: row.status_code,
    createdAt: row.created_at,
    loadDurationMs: row.load_duration_ms,
    totalRequests: row.total_requests,
    failedRequestsCount: row.failed_requests_count,
    desktopScreenshotPath: row.desktop_screenshot_path,
    mobileScreenshotPath: row.mobile_screenshot_path,
    summary: row.summary,
    status: row.status,
    score: row.score != null ? row.score : computeScore(enrichedIssues),
    criticalCount: row.critical_count != null ? row.critical_count : stats.criticalCount,
    warningCount: row.warning_count != null ? row.warning_count : stats.warningCount,
    infoCount: row.info_count != null ? row.info_count : stats.infoCount,
    brokenLinksCount: row.broken_links_count != null ? row.broken_links_count : stats.brokenLinksCount,
    pagesCrawled: pages.length,
    publicToken: row.public_token || null,
    pages,
    issues: enrichedIssues,
  };

  if (options.includeReport !== false) {
    scan.report = parseReport(row);
  }

  return scan;
}

function rowToIssue(row) {
  return {
    id: row.id,
    scanId: row.scan_id,
    scanPageId: row.scan_page_id,
    pageUrl: row.page_url,
    type: row.type,
    severity: row.severity,
    message: row.message,
    details: row.details,
    source: row.source,
    label: row.label,
    description: row.description,
    recommendation: row.recommendation,
  };
}

function getPagesForScan(scanId) {
  const pageRows = db
    .prepare('SELECT * FROM scan_pages WHERE scan_id = ? ORDER BY page_order ASC')
    .all(scanId);

  const issueRows = db
    .prepare('SELECT * FROM issues WHERE scan_id = ? ORDER BY id ASC')
    .all(scanId);

  const issuesByPageId = new Map();
  const scanLevelIssues = [];

  for (const row of issueRows) {
    const issue = rowToIssue(row);
    if (row.scan_page_id) {
      if (!issuesByPageId.has(row.scan_page_id)) {
        issuesByPageId.set(row.scan_page_id, []);
      }
      issuesByPageId.get(row.scan_page_id).push(issue);
    } else {
      scanLevelIssues.push(issue);
    }
  }

  const pages = pageRows.map((row) =>
    rowToPage(row, issuesByPageId.get(row.id) || [])
  );

  return { pages, scanLevelIssues };
}

function getIssuesForScan(scanId) {
  const rows = db
    .prepare('SELECT * FROM issues WHERE scan_id = ? ORDER BY id ASC')
    .all(scanId);
  return rows.map(rowToIssue);
}

function getAllScans() {
  const rows = db
    .prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM issues i WHERE i.scan_id = s.id) AS issue_count,
        (SELECT COUNT(*) FROM scan_pages p WHERE p.scan_id = s.id) AS pages_count
      FROM scans s
      ORDER BY s.created_at DESC
    `)
    .all();
  return rows.map((row) => ({
    ...rowToScan(row, [], [], { includeReport: false }),
    issueCount: row.issue_count,
    pagesCrawled: row.pages_count || 0,
  }));
}

function getScanById(id) {
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!row) return null;

  const allIssues = getIssuesForScan(id);
  const { pages } = getPagesForScan(id);

  if (pages.length === 0 && allIssues.length > 0) {
    return rowToScan(row, allIssues, [], { includeReport: true });
  }

  return rowToScan(row, allIssues, pages, { includeReport: true });
}

function createScan(scanData, issues = []) {
  const enrichedIssues = enrichIssues(issues);
  const score = scanData.score ?? computeScore(enrichedIssues);
  const stats = computeScanStats(enrichedIssues, scanData.failedRequestsCount ?? 0);
  const pages = scanData.pages || [];

  const insertScan = db.prepare(`
    INSERT INTO scans (
      url, final_url, title, status_code, load_duration_ms,
      total_requests, failed_requests_count,
      desktop_screenshot_path, mobile_screenshot_path, summary, status,
      score, critical_count, warning_count, info_count, broken_links_count, report_json,
      public_token
    ) VALUES (
      @url, @finalUrl, @title, @statusCode, @loadDurationMs,
      @totalRequests, @failedRequestsCount,
      @desktopScreenshotPath, @mobileScreenshotPath, @summary, @status,
      @score, @criticalCount, @warningCount, @infoCount, @brokenLinksCount, @reportJson,
      @publicToken
    )
  `);

  const insertPage = db.prepare(`
    INSERT INTO scan_pages (
      scan_id, page_order, url, final_url, title, status_code,
      load_duration_ms, total_requests, failed_requests_count, status, error_message
    ) VALUES (
      @scanId, @pageOrder, @url, @finalUrl, @title, @statusCode,
      @loadDurationMs, @totalRequests, @failedRequestsCount, @status, @errorMessage
    )
  `);

  const insertIssue = db.prepare(`
    INSERT INTO issues (
      scan_id, scan_page_id, page_url, type, severity, message, details, source, label, description, recommendation
    ) VALUES (
      @scanId, @scanPageId, @pageUrl, @type, @severity, @message, @details, @source, @label, @description, @recommendation
    )
  `);

  const transaction = db.transaction(() => {
    const result = insertScan.run({
      url: scanData.url,
      finalUrl: scanData.finalUrl,
      title: scanData.title,
      statusCode: scanData.statusCode,
      loadDurationMs: scanData.loadDurationMs,
      totalRequests: scanData.totalRequests,
      failedRequestsCount: scanData.failedRequestsCount,
      desktopScreenshotPath: scanData.desktopScreenshotPath,
      mobileScreenshotPath: scanData.mobileScreenshotPath,
      summary: scanData.summary,
      status: scanData.status || 'completed',
      score,
      criticalCount: stats.criticalCount,
      warningCount: stats.warningCount,
      infoCount: stats.infoCount,
      brokenLinksCount: stats.brokenLinksCount,
      reportJson: scanData.report ? JSON.stringify(scanData.report) : null,
      publicToken: generatePublicToken(),
    });

    const scanId = result.lastInsertRowid;
    const pageIdByOrder = new Map();

    for (const page of pages) {
      const pageResult = insertPage.run({
        scanId,
        pageOrder: page.order ?? 0,
        url: page.url,
        finalUrl: page.finalUrl,
        title: page.title,
        statusCode: page.statusCode,
        loadDurationMs: page.loadDurationMs,
        totalRequests: page.totalRequests,
        failedRequestsCount: page.failedRequestsCount,
        status: page.status || 'completed',
        errorMessage: page.error || null,
      });
      pageIdByOrder.set(page.order ?? 0, pageResult.lastInsertRowid);
    }

    for (const issue of enrichedIssues) {
      const scanPageId =
        issue.pageIndex != null ? pageIdByOrder.get(issue.pageIndex) || null : null;
      const pageUrl = issue.pageUrl || null;

      insertIssue.run({
        scanId,
        scanPageId,
        pageUrl,
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        details: issue.details || null,
        source: issue.source || null,
        label: issue.label || null,
        description: issue.description || null,
        recommendation: issue.recommendation || null,
      });
    }

    return scanId;
  });

  const scanId = transaction();
  return getScanById(scanId);
}

function getPublicReportByToken(token) {
  const row = db.prepare('SELECT * FROM scans WHERE public_token = ?').get(token);
  if (!row) return null;

  const allIssues = getIssuesForScan(row.id);
  const { pages } = getPagesForScan(row.id);

  return buildPublicReport(row, allIssues, pages);
}

module.exports = {
  getAllScans,
  getScanById,
  getPublicReportByToken,
  createScan,
};
