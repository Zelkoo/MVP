import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ScanService } from '../../services/scan.service';
import { Scan } from '../../models/scan.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { ScoreBadgeComponent } from '../../components/score-badge/score-badge.component';
import { formatScanDate } from '../../utils/format.util';
import { scanStats } from '../../utils/issue-categories';

@Component({
  selector: 'app-scan-history',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
    ScoreBadgeComponent,
  ],
  templateUrl: './scan-history.component.html',
  styleUrl: './scan-history.component.css',
})
export class ScanHistoryComponent implements OnInit {
  private readonly scanService = inject(ScanService);

  scans: Scan[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.scanService.getScans().subscribe({
      next: (scans) => {
        this.scans = scans;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scan history.';
        this.loading = false;
      },
    });
  }

  formatDate(dateStr: string | undefined): string {
    return formatScanDate(dateStr);
  }

  displayScore(scan: Scan): number {
    return scan.score ?? 100;
  }

  stats(scan: Scan) {
    return scanStats(scan);
  }
}
