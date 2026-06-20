export type IssueSeverity = 'critical' | 'warning' | 'info';

export type IssueType =
  | 'console-error'
  | 'failed-request'
  | 'broken-link'
  | 'accessibility'
  | 'performance'
  | 'validation';

export interface Issue {
  id?: number;
  scanId?: number;
  scanPageId?: number | null;
  pageUrl?: string | null;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  details?: string | null;
  source?: string | null;
  label?: string | null;
  description?: string | null;
  recommendation?: string | null;
}

export interface ScanPage {
  id?: number;
  scanId?: number;
  order: number;
  url: string;
  finalUrl?: string | null;
  title?: string | null;
  statusCode?: number | null;
  loadDurationMs?: number | null;
  totalRequests?: number;
  failedRequestsCount?: number;
  status?: string;
  error?: string | null;
  issues?: Issue[];
}

export interface Scan {
  id?: number;
  url: string;
  finalUrl?: string | null;
  title?: string | null;
  statusCode?: number | null;
  createdAt?: string;
  loadDurationMs?: number | null;
  totalRequests?: number;
  failedRequestsCount?: number;
  desktopScreenshotPath?: string | null;
  mobileScreenshotPath?: string | null;
  summary?: string | null;
  status?: string;
  score?: number;
  criticalCount?: number;
  warningCount?: number;
  infoCount?: number;
  brokenLinksCount?: number;
  pagesCrawled?: number;
  issueCount?: number;
  publicToken?: string | null;
  pages?: ScanPage[];
  issues?: Issue[];
  report?: unknown;
}

export interface IssueCategory {
  id: string;
  title: string;
  description: string;
  types: IssueType[];
}

export interface ApiError {
  error?: string;
  issues?: Issue[];
}
