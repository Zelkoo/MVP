import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringService } from '../../services/monitoring.service';
import {
  FlowRun,
  MonitoredFlow,
  MonitoringSchedule,
  SCHEDULE_OPTIONS,
  scheduleLabel,
  statusClass,
} from '../../models/monitoring.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';
import { formatScanDate } from '../../utils/format.util';
import { FlowStepDefinition } from '../../utils/flow-templates';

@Component({
  selector: 'app-monitoring-flow-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
    TestReliabilityScoreComponent,
  ],
  templateUrl: './monitoring-flow-detail.component.html',
  styleUrl: './monitoring-flow-detail.component.css',
})
export class MonitoringFlowDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly monitoringService = inject(MonitoringService);

  flow: MonitoredFlow | null = null;
  runs: FlowRun[] = [];
  loading = true;
  error: string | null = null;
  running = false;
  saving = false;
  saveError: string | null = null;
  scheduleOptions = SCHEDULE_OPTIONS;
  editSchedule: MonitoringSchedule = 'manual';
  editActive = true;
  editAlertEmail = '';
  editAlertOnFailure = true;
  editAlertOnRecovery = true;
  editFailureThreshold = 1;
  savingAlerts = false;
  saveAlertError: string | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error = 'Invalid flow ID.';
      this.loading = false;
      return;
    }

    this.loadFlow(id);
  }

  loadFlow(id: number): void {
    this.loading = true;
    this.monitoringService.getFlow(id).subscribe({
      next: (flow) => {
        this.flow = flow;
        this.runs = flow.recentRuns || [];
        this.editSchedule = flow.schedule;
        this.editActive = flow.isActive;
        this.editAlertEmail = flow.alertEmail || '';
        this.editAlertOnFailure = flow.alertOnFailure !== false;
        this.editAlertOnRecovery = flow.alertOnRecovery !== false;
        this.editFailureThreshold = flow.failureThreshold || 1;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load flow.';
        this.loading = false;
      },
    });
  }

  saveSchedule(): void {
    if (!this.flow) return;

    this.saving = true;
    this.saveError = null;
    this.monitoringService
      .updateFlow(this.flow.id, { schedule: this.editSchedule, isActive: this.editActive })
      .subscribe({
        next: (flow) => {
          this.flow = { ...this.flow!, ...flow };
          this.saving = false;
        },
        error: (err) => {
          this.saveError = err.error?.error || 'Failed to save schedule.';
          this.saving = false;
        },
      });
  }

  saveAlertSettings(): void {
    if (!this.flow) return;

    this.savingAlerts = true;
    this.saveAlertError = null;
    this.monitoringService
      .updateFlow(this.flow.id, {
        alertEmail: this.editAlertEmail.trim() || null,
        alertOnFailure: this.editAlertOnFailure,
        alertOnRecovery: this.editAlertOnRecovery,
        failureThreshold: Math.max(this.editFailureThreshold || 1, 1),
      })
      .subscribe({
        next: (flow) => {
          this.flow = { ...this.flow!, ...flow };
          this.savingAlerts = false;
        },
        error: (err) => {
          this.saveAlertError = err.error?.error || 'Failed to save alert settings.';
          this.savingAlerts = false;
        },
      });
  }

  lastAlertLabel(): string {
    if (!this.flow?.lastAlertSentAt) return 'No alerts sent yet';
    const type =
      this.flow.lastAlertStatus === 'failure'
        ? 'Failure alert'
        : this.flow.lastAlertStatus === 'recovery'
          ? 'Recovery alert'
          : 'Alert';
    return `${type} · ${this.formatDate(this.flow.lastAlertSentAt)}`;
  }

  runNow(): void {
    if (!this.flow || this.running) return;

    this.running = true;
    this.monitoringService.runFlow(this.flow.id).subscribe({
      next: () => {
        this.running = false;
        this.loadFlow(this.flow!.id);
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to run flow.';
        this.running = false;
      },
    });
  }

  flowSteps(): FlowStepDefinition[] {
    if (!this.flow) return [];
    return [...this.flow.steps, ...this.flow.successConditions] as unknown as FlowStepDefinition[];
  }

  formatDate(value: string | null | undefined): string {
    return formatScanDate(value || undefined);
  }

  formatDuration(ms: number | null | undefined): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  passRateLabel(rate: number | null | undefined): string {
    if (rate == null) return '—';
    return `${rate}%`;
  }

  screenshotUrl(path: string | null | undefined): string | null {
    return this.monitoringService.screenshotUrl(path);
  }

  failedRuns(): FlowRun[] {
    return this.runs.filter((run) => run.status !== 'passed');
  }

  passedRuns(): number {
    return this.runs.filter((run) => run.status === 'passed').length;
  }

  chartBars(): Array<{ label: string; height: number; status: string }> {
    const recent = [...this.runs].slice(0, 20).reverse();
    return recent.map((run) => ({
      label: this.formatDate(run.startedAt),
      height: run.status === 'passed' ? 100 : run.status === 'warning' ? 60 : 30,
      status: run.status,
    }));
  }

  scheduleLabel = scheduleLabel;
  statusClass = statusClass;
}
