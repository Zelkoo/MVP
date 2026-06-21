import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { Issue } from '../../models/scan.model';
import { ScenarioIssue, ScenarioRun, ScenarioStep } from '../../models/scenario.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { ScoreBadgeComponent } from '../../components/score-badge/score-badge.component';
import { IssueListComponent } from '../../components/issue-list/issue-list.component';
import { formatScanDate } from '../../utils/format.util';
import { stepResultSummary } from '../../utils/element-target';

@Component({
  selector: 'app-scenario-run',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
    ScoreBadgeComponent,
    IssueListComponent,
  ],
  templateUrl: './scenario-run.component.html',
  styleUrl: './scenario-run.component.css',
})
export class ScenarioRunComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly scenarioService = inject(ScenarioService);

  run: ScenarioRun | null = null;
  loading = true;
  error: string | null = null;
  devDetailsOpenSteps = new Set<number>();

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error = 'Invalid run ID.';
      this.loading = false;
      return;
    }

    this.scenarioService.getScenarioRun(id).subscribe({
      next: (run) => {
        this.run = run;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scenario run.';
        this.loading = false;
      },
    });
  }

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }

  screenshotUrl(): string | null {
    return this.scenarioService.screenshotUrl(this.run?.screenshotPath);
  }

  videoUrl(): string | null {
    return this.scenarioService.videoUrl(this.run?.videoPath);
  }

  statusClass(): string {
    return this.run?.status || 'error';
  }

  flowIssues(): Issue[] {
    return (this.run?.result.issues || []).map((issue) => this.toIssue(issue));
  }

  consoleIssues(): Issue[] {
    return (this.run?.result.consoleErrors || []).map((details) => ({
      type: 'console-error' as const,
      severity: 'warning' as const,
      message: 'Console error during scenario run',
      details,
      recommendation: 'Fix JavaScript errors triggered by this user flow.',
      label: 'Console Error',
      description: 'A console error occurred while executing this scenario.',
    }));
  }

  stepScreenshot(step: ScenarioStep): string | null {
    return this.scenarioService.screenshotUrl(step.screenshotPath);
  }

  stepActionLabel(step: ScenarioStep): string {
    if (step.action) {
      return step.action.replace(/([A-Z])/g, ' $1').toLowerCase();
    }
    return '';
  }

  formatDuration(ms: number | undefined): string {
    if (ms == null) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  toggleDevDetails(index: number): void {
    if (this.devDetailsOpenSteps.has(index)) {
      this.devDetailsOpenSteps.delete(index);
    } else {
      this.devDetailsOpenSteps.add(index);
    }
  }

  devDetailsOpen(index: number): boolean {
    return this.devDetailsOpenSteps.has(index);
  }

  stepSummary(step: ScenarioStep): string {
    return stepResultSummary({
      name: step.name,
      action: step.action,
      status: step.status,
      message: step.message,
      selectorStrategy: step.selectorStrategy,
    });
  }

  hasSelectorAttempts(step: ScenarioStep): boolean {
    return Boolean(step.attempts?.length || step.technicalDetails);
  }

  private toIssue(issue: ScenarioIssue): Issue {
    return {
      type: (issue.type as Issue['type']) || 'validation',
      severity: issue.severity,
      message: issue.message,
      details: issue.details,
      recommendation: issue.recommendation,
      label: issue.label,
      description: issue.description,
    };
  }
}
