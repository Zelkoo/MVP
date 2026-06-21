import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonitoringService } from '../../services/monitoring.service';
import { MonitoringClientReport, statusClass } from '../../models/monitoring.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-monitoring-client-report',
  standalone: true,
  imports: [CommonModule, LoadingComponent],
  templateUrl: './monitoring-client-report.component.html',
  styleUrl: './monitoring-client-report.component.css',
})
export class MonitoringClientReportComponent implements OnChanges {
  private readonly monitoringService = inject(MonitoringService);

  @Input({ required: true }) projectId!: number;

  report: MonitoringClientReport | null = null;
  loading = false;
  error: string | null = null;

  ngOnChanges(): void {
    if (!this.projectId) return;
    this.loadReport();
  }

  loadReport(): void {
    this.loading = true;
    this.error = null;
    this.monitoringService.getClientReport(this.projectId, 30).subscribe({
      next: (report) => {
        this.report = report;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load client report.';
        this.loading = false;
      },
    });
  }

  formatDate(value: string | undefined | null): string {
    return formatScanDate(value || undefined);
  }

  flowStatusClass(status: string): string {
    if (status === 'passed') return 'passed';
    if (status === 'recovered') return 'recovered';
    if (status === 'failed') return 'failed';
    return 'unknown';
  }

  runBarClass(status: string): string {
    return statusClass(status);
  }

  passRateLabel(): string {
    if (this.report?.passRate == null) return '—';
    return `${this.report.passRate}%`;
  }

  printReport(): void {
    window.print();
  }
}
