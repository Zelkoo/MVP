import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MonitoringService } from '../../services/monitoring.service';
import { ScenarioService } from '../../services/scenario.service';
import {
  MonitoredFlow,
  ProjectDetail,
  scheduleLabel,
  statusClass,
} from '../../models/monitoring.model';
import { Scenario } from '../../models/scenario.model';
import { ScenarioPickerComponent } from '../../components/scenario-picker/scenario-picker.component';
import { MonitoringClientReportComponent } from '../../components/monitoring-client-report/monitoring-client-report.component';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-project-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingComponent, ErrorMessageComponent, ScenarioPickerComponent, MonitoringClientReportComponent],
  templateUrl: './project-dashboard.component.html',
  styleUrl: './project-dashboard.component.css',
})
export class ProjectDashboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly monitoringService = inject(MonitoringService);
  private readonly scenarioService = inject(ScenarioService);

  project: ProjectDetail | null = null;
  scenarios: Scenario[] = [];
  loading = true;
  error: string | null = null;
  addingFlow = false;
  addError: string | null = null;
  selectedScenarioId: number | null = null;
  showAddFlow = false;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error = 'Invalid project ID.';
      this.loading = false;
      return;
    }

    this.monitoringService.getProject(id).subscribe({
      next: (project) => {
        this.project = project;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load project.';
        this.loading = false;
      },
    });

    this.scenarioService.getScenarios().subscribe({
      next: (scenarios) => {
        this.scenarios = scenarios;
      },
    });
  }

  addFlowFromScenario(): void {
    if (!this.project || !this.selectedScenarioId) {
      this.addError = 'Select a scenario to monitor.';
      return;
    }

    this.addingFlow = true;
    this.addError = null;
    this.monitoringService
      .createFlow({ projectId: this.project.id, scenarioId: this.selectedScenarioId })
      .subscribe({
        next: () => {
          this.addingFlow = false;
          this.showAddFlow = false;
          this.selectedScenarioId = null;
          this.reloadProject();
        },
        error: (err) => {
          this.addError = err.error?.error || 'Failed to add flow.';
          this.addingFlow = false;
        },
      });
  }

  reloadProject(): void {
    if (!this.project) return;
    this.monitoringService.getProject(this.project.id).subscribe({
      next: (project) => {
        this.project = project;
      },
    });
  }

  formatDate(value: string | null | undefined): string {
    return formatScanDate(value || undefined);
  }

  passRateLabel(rate: number | null | undefined): string {
    if (rate == null) return '—';
    return `${rate}%`;
  }

  scheduleLabel = scheduleLabel;
  statusClass = statusClass;

  lastStatus(flow: MonitoredFlow): string {
    return flow.stats?.lastRun?.status || '—';
  }

  nextRun(flow: MonitoredFlow): string {
    if (flow.schedule === 'manual') return 'Manual only';
    return this.formatDate(flow.nextRunAt);
  }
}
