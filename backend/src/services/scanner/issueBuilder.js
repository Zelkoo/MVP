function buildIssues(state) {
  const issues = [];

  for (const page of state.pages || []) {
    const pageLabel = page.title || page.url;

    for (const error of page.consoleErrors || []) {
      issues.push({
        type: 'console-error',
        severity: 'critical',
        message: 'Console error detected',
        details: error,
        source: 'browser-console',
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    const networkKeys = new Set();

    for (const entry of page.failedRequests || []) {
      const key = `${page.order}:${entry.method}:${entry.url}:${entry.failure}`;
      if (networkKeys.has(key)) continue;
      networkKeys.add(key);

      issues.push({
        type: 'failed-request',
        severity: 'warning',
        message: `Failed ${entry.method} request`,
        details: `${entry.failure} [${entry.resourceType}] ${entry.url}`,
        source: entry.url,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    for (const entry of page.errorResponses || []) {
      const key = `${page.order}:${entry.method}:${entry.url}:${entry.status}`;
      if (networkKeys.has(key)) continue;
      networkKeys.add(key);

      issues.push({
        type: 'failed-request',
        severity: entry.status >= 500 ? 'critical' : 'warning',
        message: `HTTP ${entry.status} response`,
        details: `${entry.method} [${entry.resourceType}] ${entry.url}`,
        source: entry.url,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    for (const accessibilityIssue of page.accessibilityIssues || []) {
      issues.push({
        ...accessibilityIssue,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    if (page.statusCode && page.statusCode >= 400) {
      issues.push({
        type: 'validation',
        severity: 'critical',
        message: `HTTP ${page.statusCode} response`,
        details: `Page "${pageLabel}" returned status code ${page.statusCode}`,
        source: page.finalUrl,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    if (page.status === 'failed') {
      issues.push({
        type: 'validation',
        severity: 'warning',
        message: 'Page crawl failed',
        details: page.error || `Could not analyze ${page.url}`,
        source: page.url,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    if (page.loadDurationMs > 5000) {
      issues.push({
        type: 'performance',
        severity: 'warning',
        message: 'Slow page load',
        details: `Page took ${page.loadDurationMs}ms to load (threshold: 5000ms)`,
        source: page.url,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }

    if (page.totalRequests > 100) {
      issues.push({
        type: 'performance',
        severity: 'info',
        message: 'High number of network requests',
        details: `${page.totalRequests} requests detected on this page`,
        source: page.url,
        pageIndex: page.order,
        pageUrl: page.url,
      });
    }
  }

  for (const link of state.brokenLinks || []) {
    issues.push({
      type: 'broken-link',
      severity: 'critical',
      message: link.status
        ? `Broken ${link.scope} link (HTTP ${link.status})`
        : `Broken ${link.scope} link (unreachable)`,
      details: link.href,
      source: link.text || link.href,
      pageIndex: 0,
      pageUrl: state.pages?.[0]?.url || state.url,
    });
  }

  if (state.timedOut) {
    issues.push({
      type: 'validation',
      severity: 'warning',
      message: 'Scan stopped due to global timeout',
      details: `The scan exceeded ${Math.round(state.globalTimeoutMs / 1000)} seconds. Partial results were saved from ${state.pages?.length || 0} page(s).`,
      source: 'scanner',
    });
  }

  const screenshots = state.screenshots;
  if (screenshots && !screenshots.desktop?.captured) {
    issues.push({
      type: 'validation',
      severity: 'info',
      message: 'Desktop screenshot not captured',
      details: screenshots.desktop?.error || 'Screenshot step failed.',
      source: 'screenshots',
      pageIndex: 0,
      pageUrl: state.pages?.[0]?.url || state.url,
    });
  }

  if (screenshots && !screenshots.mobile?.captured) {
    issues.push({
      type: 'validation',
      severity: 'info',
      message: 'Mobile screenshot not captured',
      details: screenshots.mobile?.error || 'Screenshot step failed.',
      source: 'screenshots',
      pageIndex: 0,
      pageUrl: state.pages?.[0]?.url || state.url,
    });
  }

  return issues;
}

module.exports = { buildIssues };
