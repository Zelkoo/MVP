const { enrichIssues } = require('./scanMetrics');

function toAssetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return path.startsWith('/') ? path : `/${path}`;
}

function affectedUrl(issue) {
  if (issue.pageUrl) return issue.pageUrl;
  if (issue.source && /^https?:\/\//i.test(issue.source)) {
    return issue.source;
  }
  return null;
}

function toPublicIssue(issue) {
  return {
    type: issue.type,
    severity: issue.severity,
    message: issue.message,
    label: issue.label || null,
    description: issue.description || null,
    recommendation: issue.recommendation || null,
    details: issue.details || null,
    affectedUrl: affectedUrl(issue),
  };
}

function toPublicPage(page) {
  return {
    order: page.order,
    url: page.url,
    finalUrl: page.finalUrl || page.url,
    title: page.title || null,
    statusCode: page.statusCode ?? null,
    issueCount: (page.issues || []).length,
  };
}

function buildPublicReport(scanRow, issues, pages = []) {
  const enrichedIssues = enrichIssues(issues);
  const publicIssues = enrichedIssues.map(toPublicIssue);

  publicIssues.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
  });

  return {
    token: scanRow.public_token,
    url: scanRow.url,
    finalUrl: scanRow.final_url || scanRow.url,
    title: scanRow.title || null,
    summary: scanRow.summary || null,
    score: scanRow.score ?? 100,
    status: scanRow.status || 'completed',
    createdAt: scanRow.created_at,
    criticalCount: scanRow.critical_count ?? 0,
    warningCount: scanRow.warning_count ?? 0,
    infoCount: scanRow.info_count ?? 0,
    pagesCrawled: pages.length || 1,
    desktopScreenshotUrl: toAssetUrl(scanRow.desktop_screenshot_path),
    mobileScreenshotUrl: toAssetUrl(scanRow.mobile_screenshot_path),
    pages: pages.map(toPublicPage),
    issues: publicIssues,
  };
}

module.exports = {
  buildPublicReport,
  toPublicIssue,
  toAssetUrl,
};
