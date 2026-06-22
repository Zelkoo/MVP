const ISSUE_TYPE_META = {
  'console-error': {
    label: 'Console Error',
    description:
      'A JavaScript error was logged in the browser console. This often breaks interactivity or signals a runtime bug.',
    recommendation:
      'Open DevTools, reproduce the issue, then fix the script error, missing import, or undefined value causing the failure.',
  },
  'failed-request': {
    label: 'Failed Network Request',
    description:
      'A resource failed to load over the network — for example an API call, script, stylesheet, font, or image.',
    recommendation:
      'Confirm the URL is correct, the resource exists, CORS headers allow the request, and the server returns a successful response.',
  },
  'broken-link': {
    label: 'Broken Link',
    description:
      'An anchor link returned a not-found or server error when checked. Users clicking it may hit a dead page.',
    recommendation:
      'Update the href to a working destination, remove the link, or add a redirect on the server for the old URL.',
  },
  accessibility: {
    label: 'Accessibility Warning',
    description:
      'Basic accessibility check found content that may be hard to use with keyboard navigation or screen readers.',
    recommendation: 'See the specific fix below for this element.',
  },
  performance: {
    label: 'Performance Warning',
    description:
      'The page exceeded a basic performance threshold such as load time or number of network requests.',
    recommendation:
      'Reduce payload size, defer non-critical scripts, optimize images, and cache static assets to improve load performance.',
  },
  validation: {
    label: 'Validation Issue',
    description:
      'The page or scan returned an HTTP error status or failed validation during analysis.',
    recommendation:
      'Fix the server response for the page URL and ensure it returns a successful HTTP status for normal visits.',
  },
};

const ACCESSIBILITY_FIXES = [
  {
    match: /alt/i,
    recommendation:
      'Add a concise, descriptive alt attribute to the image. Use alt="" only for decorative images.',
  },
  {
    match: /button/i,
    recommendation:
      'Add visible button text or an aria-label / aria-labelledby attribute so assistive tech can identify the control.',
  },
  {
    match: /form field|label|name/i,
    recommendation:
      'Associate the input with a <label>, or provide name, aria-label, aria-labelledby, or a placeholder.',
  },
  {
    match: /duplicate id/i,
    recommendation: 'Ensure every id attribute value is unique within the page.',
  },
  {
    match: /lang attribute/i,
    recommendation: 'Add lang="en" (or the correct language code) to the <html> element.',
  },
  {
    match: /page title/i,
    recommendation: 'Add a descriptive <title> element inside <head>.',
  },
  {
    match: /link without visible text/i,
    recommendation:
      'Add visible link text, aria-label, or an image with alt text inside the anchor.',
  },
];

const ISSUE_CATEGORIES = [
  {
    id: 'console-error',
    title: 'Console Errors',
    description: 'JavaScript errors captured from the browser console during page load.',
    types: ['console-error'],
  },
  {
    id: 'failed-request',
    title: 'Failed Network Requests',
    description: 'Assets or API calls that failed to load while the page was analyzed.',
    types: ['failed-request'],
  },
  {
    id: 'broken-link',
    title: 'Broken Links',
    description: 'Links that returned 404/410 or a server error when checked automatically.',
    types: ['broken-link'],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    description: 'Basic checks for alt text, labels, and readable link/button names.',
    types: ['accessibility'],
  },
  {
    id: 'performance-validation',
    title: 'Performance & Validation',
    description: 'Load-time metrics, request volume, and HTTP response validation.',
    types: ['performance', 'validation'],
  },
];

function resolveAccessibilityRecommendation(message) {
  const rule = ACCESSIBILITY_FIXES.find((entry) => entry.match.test(message));
  return rule?.recommendation || ISSUE_TYPE_META.accessibility.recommendation;
}

function enrichIssue(issue) {
  const meta = ISSUE_TYPE_META[issue.type] || ISSUE_TYPE_META.validation;
  let recommendation = meta.recommendation;

  if (issue.type === 'accessibility') {
    recommendation = resolveAccessibilityRecommendation(issue.message);
  } else if (issue.type === 'performance' && /slow page load/i.test(issue.message)) {
    recommendation =
      'Audit large assets, enable compression, lazy-load below-the-fold content, and reduce render-blocking scripts.';
  } else if (issue.type === 'performance' && /network requests/i.test(issue.message)) {
    recommendation =
      'Bundle or defer scripts, combine requests where possible, and remove unused third-party tags.';
  } else if (issue.type === 'validation' && /scan failed/i.test(issue.message)) {
    recommendation =
      'Verify the URL is public, reachable, and not blocked by bot protection or authentication.';
  }

  return {
    ...issue,
    label: meta.label,
    description: meta.description,
    recommendation,
  };
}

function enrichIssues(issues) {
  return (issues || []).map(enrichIssue);
}

function computeScore(issues) {
  let score = 100;

  for (const issue of issues || []) {
    if (issue.severity === 'critical') score -= 15;
    else if (issue.severity === 'warning') score -= 5;
    else if (issue.severity === 'info') score -= 1;
  }

  return Math.max(0, score);
}

function computeScanStats(issues, failedRequestsCount = 0) {
  const enriched = issues || [];

  return {
    criticalCount: enriched.filter((i) => i.severity === 'critical').length,
    warningCount: enriched.filter((i) => i.severity === 'warning').length,
    infoCount: enriched.filter((i) => i.severity === 'info').length,
    failedRequestsCount,
    brokenLinksCount: enriched.filter((i) => i.type === 'broken-link').length,
  };
}

function buildSummary(issues, score, pagesCrawled = 1) {
  const stats = computeScanStats(issues);
  const total = issues.length;
  const pagesLabel =
    pagesCrawled > 1 ? ` across ${pagesCrawled} pages` : '';

  if (total === 0) {
    return `Quality score: ${score}/100. No issues found${pagesLabel} — the site looks good from a basic frontend QA perspective.`;
  }

  const parts = [`Quality score: ${score}/100`, `Found ${total} issue${total === 1 ? '' : 's'}${pagesLabel}`];
  if (stats.criticalCount) parts.push(`${stats.criticalCount} critical`);
  if (stats.warningCount) parts.push(`${stats.warningCount} warning`);
  if (stats.infoCount) parts.push(`${stats.infoCount} info`);

  return `${parts.join(' — ')}. Review grouped findings and recommended fixes below.`;
}

function scoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs work';
  return 'Poor';
}

module.exports = {
  ISSUE_CATEGORIES,
  ISSUE_TYPE_META,
  enrichIssue,
  enrichIssues,
  computeScore,
  computeScanStats,
  buildSummary,
  scoreLabel,
};
