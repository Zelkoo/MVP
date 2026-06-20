import { Issue, Scan } from '../models/scan.model';

export type ComparisonVerdict = 'improved' | 'worsened' | 'unchanged';

export interface ScanComparison {
  current: Scan;
  previous: Scan;
  currentScore: number;
  previousScore: number;
  scoreDifference: number;
  verdict: ComparisonVerdict;
  verdictLabel: string;
  newIssues: Issue[];
  resolvedIssues: Issue[];
  unchangedIssues: Issue[];
  newFailedRequests: Issue[];
  resolvedFailedRequests: Issue[];
  unchangedFailedRequests: Issue[];
}

function affectedUrl(issue: Issue): string {
  const candidates = [issue.pageUrl, issue.source].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate)) {
      return candidate.trim().toLowerCase();
    }
  }

  return (issue.pageUrl || '').trim().toLowerCase();
}

export function issueMatchKey(issue: Issue): string {
  return [
    issue.type,
    affectedUrl(issue),
    (issue.message || '').trim().toLowerCase(),
    (issue.details || '').trim().toLowerCase(),
  ].join('|');
}

function scanScore(scan: Scan): number {
  return scan.score ?? 100;
}

function compareIssueSets(currentIssues: Issue[], previousIssues: Issue[]) {
  const previousKeys = new Map<string, Issue>();
  const currentKeys = new Map<string, Issue>();

  for (const issue of previousIssues) {
    previousKeys.set(issueMatchKey(issue), issue);
  }

  for (const issue of currentIssues) {
    currentKeys.set(issueMatchKey(issue), issue);
  }

  const newIssues: Issue[] = [];
  const resolvedIssues: Issue[] = [];
  const unchangedIssues: Issue[] = [];

  for (const [key, issue] of currentKeys) {
    if (previousKeys.has(key)) {
      unchangedIssues.push(issue);
    } else {
      newIssues.push(issue);
    }
  }

  for (const [key, issue] of previousKeys) {
    if (!currentKeys.has(key)) {
      resolvedIssues.push(issue);
    }
  }

  return { newIssues, resolvedIssues, unchangedIssues };
}

function verdictFromComparison(
  scoreDifference: number,
  newIssues: Issue[],
  resolvedIssues: Issue[]
): ComparisonVerdict {
  if (scoreDifference > 0) return 'improved';
  if (scoreDifference < 0) return 'worsened';
  if (newIssues.length === 0 && resolvedIssues.length === 0) return 'unchanged';
  if (resolvedIssues.length > newIssues.length) return 'improved';
  if (newIssues.length > resolvedIssues.length) return 'worsened';
  return 'unchanged';
}

function verdictLabel(verdict: ComparisonVerdict): string {
  if (verdict === 'improved') return 'Improved';
  if (verdict === 'worsened') return 'Worsened';
  return 'Unchanged';
}

export function compareScans(current: Scan, previous: Scan): ScanComparison {
  const currentIssues = current.issues || [];
  const previousIssues = previous.issues || [];
  const { newIssues, resolvedIssues, unchangedIssues } = compareIssueSets(
    currentIssues,
    previousIssues
  );

  const currentScore = scanScore(current);
  const previousScore = scanScore(previous);
  const scoreDifference = currentScore - previousScore;
  const verdict = verdictFromComparison(scoreDifference, newIssues, resolvedIssues);

  const isFailedRequest = (issue: Issue) => issue.type === 'failed-request';

  return {
    current,
    previous,
    currentScore,
    previousScore,
    scoreDifference,
    verdict,
    verdictLabel: verdictLabel(verdict),
    newIssues,
    resolvedIssues,
    unchangedIssues,
    newFailedRequests: newIssues.filter(isFailedRequest),
    resolvedFailedRequests: resolvedIssues.filter(isFailedRequest),
    unchangedFailedRequests: unchangedIssues.filter(isFailedRequest),
  };
}
