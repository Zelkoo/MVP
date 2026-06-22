const { enrichIssues, computeScore, computeScanStats, buildSummary } = require('../../utils/scanMetrics');
const { buildIssues } = require('./issueBuilder');

function aggregateNetwork(pages) {
  const requests = [];
  const failed = [];
  const errorResponses = [];

  for (const page of pages) {
    for (const entry of page.failedRequests || []) failed.push(entry);
    for (const entry of page.errorResponses || []) errorResponses.push(entry);
  }

  return {
    totalRequests: pages.reduce((sum, page) => sum + (page.totalRequests || 0), 0),
    failedRequestsCount: pages.reduce((sum, page) => sum + (page.failedRequestsCount || 0), 0),
    errorResponseCount: errorResponses.length,
    requests,
    failed,
    errorResponses,
  };
}

function buildScanResult(state) {
  const pages = (state.pages || []).map((page, order) => ({
    order: page.order ?? order,
    url: page.url,
    finalUrl: page.finalUrl,
    title: page.title,
    statusCode: page.statusCode,
    loadDurationMs: page.loadDurationMs,
    totalRequests: page.totalRequests,
    failedRequestsCount: page.failedRequestsCount,
    status: page.status,
    error: page.error,
    consoleErrorCount: (page.consoleErrors || []).length,
    accessibilityIssueCount: (page.accessibilityIssues || []).length,
  }));

  const firstPage = state.pages?.[0];
  const network = aggregateNetwork(state.pages || []);
  const rawIssues = buildIssues(state);
  const issues = enrichIssues(rawIssues);
  const score = computeScore(issues);
  const stats = computeScanStats(issues, network.failedRequestsCount);
  const totalLoadMs = Date.now() - state.startTime;

  const report = {
    metadata: {
      url: state.url,
      finalUrl: firstPage?.finalUrl || state.url,
      title: firstPage?.title || null,
      statusCode: firstPage?.statusCode ?? null,
      scannedAt: new Date().toISOString(),
      durationMs: totalLoadMs,
      timedOut: state.timedOut,
      partial: state.partial,
      status: state.timedOut || state.partial ? 'partial' : 'completed',
      pagesCrawled: pages.length,
      maxPages: state.maxPages,
    },
    performance: {
      loadDurationMs: totalLoadMs,
      totalRequests: network.totalRequests,
      failedRequestsCount: network.failedRequestsCount,
      errorResponseCount: network.errorResponseCount,
      network,
    },
    screenshots: state.screenshots || {
      desktop: { path: null, captured: false, error: null },
      mobile: { path: null, captured: false, error: null },
    },
    pages,
    issues,
    summary: {
      text: buildSummary(issues, score, pages.length),
      score,
      stats,
    },
  };

  return {
    url: report.metadata.url,
    finalUrl: report.metadata.finalUrl,
    title: report.metadata.title,
    statusCode: report.metadata.statusCode,
    loadDurationMs: report.performance.loadDurationMs,
    totalRequests: report.performance.totalRequests,
    failedRequestsCount: report.performance.failedRequestsCount,
    desktopScreenshotPath: report.screenshots.desktop?.path || null,
    mobileScreenshotPath: report.screenshots.mobile?.path || null,
    summary: report.summary.text,
    score: report.summary.score,
    status: report.metadata.status,
    pagesCrawled: pages.length,
    issues,
    pages: state.pages || [],
    report,
  };
}

module.exports = { buildScanResult };
