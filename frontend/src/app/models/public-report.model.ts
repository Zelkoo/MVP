export interface PublicReportIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  label?: string | null;
  description?: string | null;
  recommendation?: string | null;
  details?: string | null;
  affectedUrl?: string | null;
}

export interface PublicReportPage {
  order: number;
  url: string;
  finalUrl: string;
  title?: string | null;
  statusCode?: number | null;
  issueCount: number;
}

export interface PublicReport {
  token: string;
  url: string;
  finalUrl: string;
  title?: string | null;
  summary?: string | null;
  score: number;
  status: string;
  createdAt: string;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  pagesCrawled: number;
  desktopScreenshotUrl?: string | null;
  mobileScreenshotUrl?: string | null;
  pages: PublicReportPage[];
  issues: PublicReportIssue[];
}
