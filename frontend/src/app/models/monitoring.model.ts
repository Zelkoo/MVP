import { TestReliabilityResult } from './test-reliability.model';

export type MonitoringSchedule = 'manual' | 'daily' | 'weekly' | 'every-6-hours';

export interface MonitoringProject {
  id: number;
  name: string;
  domain: string;
  createdAt: string;
  stats?: ProjectStats;
}

export interface ProjectStats {
  flowCount: number;
  activeFlowCount: number;
  totalRuns: number;
  passRate: number | null;
  lastFailure: FlowRun | null;
  flows?: Array<{ flowId: number; totalRuns: number; passedRuns: number; passRate: number | null }>;
}

export interface MonitoredFlow {
  id: number;
  projectId: number;
  name: string;
  startUrl: string;
  steps: Record<string, unknown>[];
  successConditions: Record<string, unknown>[];
  schedule: MonitoringSchedule;
  isActive: boolean;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  alertEmail?: string | null;
  alertOnFailure?: boolean;
  alertOnRecovery?: boolean;
  failureThreshold?: number;
  lastAlertSentAt?: string | null;
  lastAlertStatus?: 'failure' | 'recovery' | string | null;
  consecutiveFailureCount?: number;
  stats?: FlowStats;
  project?: MonitoringProject;
  recentRuns?: FlowRun[];
  failedRuns?: FlowRun[];
  reliability?: TestReliabilityResult;
}

export interface FlowStats {
  totalRuns: number;
  passedRuns: number;
  passRate: number | null;
  avgDurationMs: number | null;
  lastRun: FlowRun | null;
  lastFailure: FlowRun | null;
}

export interface FlowRun {
  id: number;
  flowId: number;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: {
    summary?: string;
    steps?: Array<{ name: string; status: string; message?: string }>;
    issues?: Array<{ severity: string; message: string }>;
  };
  screenshotPath: string | null;
  failureReason: string | null;
  score: number;
  flow?: MonitoredFlow;
}

export interface ProjectDetail extends MonitoringProject {
  stats: ProjectStats;
  flows: MonitoredFlow[];
}

export interface MonitoringClientReportFlow {
  id: number;
  name: string;
  rawName?: string;
  statusLabel: string;
  status: 'passed' | 'failed' | 'recovered' | 'unknown' | string;
  lastRunAt?: string | null;
}

export interface MonitoringClientReportRun {
  status: string;
  startedAt: string;
  flowName: string;
}

export interface MonitoringClientReport {
  domain: string;
  projectName: string;
  generatedAt: string;
  passRate: number | null;
  recentRunCount: number;
  flows: MonitoringClientReportFlow[];
  recentRuns: MonitoringClientReportRun[];
}

export const SCHEDULE_OPTIONS: Array<{ value: MonitoringSchedule; label: string }> = [
  { value: 'manual', label: 'Manual only' },
  { value: 'every-6-hours', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

export function scheduleLabel(schedule: MonitoringSchedule | string): string {
  return SCHEDULE_OPTIONS.find((option) => option.value === schedule)?.label || schedule;
}

export function statusClass(status: string | null | undefined): string {
  if (status === 'passed') return 'passed';
  if (status === 'failed') return 'failed';
  if (status === 'warning') return 'warning';
  return 'error';
}
