import { Issue, IssueCategory, IssueType, Scan } from '../models/scan.model';

const SEO_ACCESSIBILITY_PATTERN = /page title|lang attribute|meta description|document title/i;
const SITE_WIDE_VALIDATION_PATTERN = /timeout|screenshot|crawl failed|scan stopped|scan failed/i;

export const ISSUE_CATEGORIES: IssueCategory[] = [
  {
    id: 'console-error',
    title: 'Console Errors',
    description: 'JavaScript errors captured from the browser console during page load.',
    types: ['console-error'],
  },
  {
    id: 'failed-request',
    title: 'Failed Requests',
    description: 'Assets or API calls that failed to load while pages were analyzed.',
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
    description: 'Basic checks for alt text, labels, and readable link or button names.',
    types: ['accessibility'],
  },
  {
    id: 'performance',
    title: 'Performance',
    description: 'Load-time metrics and high request volume detected during the crawl.',
    types: ['performance'],
  },
  {
    id: 'seo-basics',
    title: 'SEO Basics',
    description: 'Page metadata, HTTP response checks, and basic SEO signals.',
    types: ['validation'],
  },
];

export const ISSUE_TYPE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: 'console-error', label: 'Console error' },
  { value: 'failed-request', label: 'Failed request' },
  { value: 'broken-link', label: 'Broken link' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'performance', label: 'Performance' },
  { value: 'validation', label: 'Validation / SEO' },
];

export function isSeoCategoryIssue(issue: Issue): boolean {
  if (issue.type === 'validation') {
    return true;
  }

  if (issue.type === 'accessibility' && SEO_ACCESSIBILITY_PATTERN.test(issue.message)) {
    return true;
  }

  return false;
}

export function isSiteWideIssue(issue: Issue): boolean {
  if (issue.type !== 'validation') {
    return false;
  }

  return SITE_WIDE_VALIDATION_PATTERN.test(issue.message);
}

export function issueBelongsToCategory(issue: Issue, category: IssueCategory): boolean {
  if (category.id === 'seo-basics') {
    return isSeoCategoryIssue(issue);
  }

  if (category.id === 'accessibility') {
    return issue.type === 'accessibility' && !isSeoCategoryIssue(issue);
  }

  return category.types.includes(issue.type);
}

export function issuesForCategory(issues: Issue[], category: IssueCategory): Issue[] {
  return issues.filter((issue) => issueBelongsToCategory(issue, category));
}

export function issuesForCategoryTypes(issues: Issue[], types: IssueType[]): Issue[] {
  return issues.filter((issue) => types.includes(issue.type));
}

export function scoreLabel(score: number | undefined | null): string {
  const value = score ?? 0;
  if (value >= 90) return 'Excellent';
  if (value >= 75) return 'Good';
  if (value >= 50) return 'Needs work';
  return 'Poor';
}

export function scoreClass(score: number | undefined | null): string {
  const value = score ?? 0;
  if (value >= 90) return 'excellent';
  if (value >= 75) return 'good';
  if (value >= 50) return 'fair';
  return 'poor';
}

export function scanStats(scan: Scan) {
  const issues = scan.issues || [];
  return {
    criticalCount: scan.criticalCount ?? issues.filter((i) => i.severity === 'critical').length,
    warningCount: scan.warningCount ?? issues.filter((i) => i.severity === 'warning').length,
    infoCount: scan.infoCount ?? issues.filter((i) => i.severity === 'info').length,
    totalIssues: issues.length,
    failedRequestsCount: scan.failedRequestsCount ?? 0,
    brokenLinksCount:
      scan.brokenLinksCount ?? issues.filter((i) => i.type === 'broken-link').length,
    pagesCrawled: scan.pagesCrawled ?? scan.pages?.length ?? 1,
  };
}

export function typeLabel(type: IssueType | string): string {
  const match = ISSUE_TYPE_OPTIONS.find((option) => option.value === type);
  if (match) return match.label;
  return String(type).replace(/-/g, ' ');
}
