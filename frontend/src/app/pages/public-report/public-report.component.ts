import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ScanService } from '../../services/scan.service';
import { PublicReport } from '../../models/public-report.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { ScoreBadgeComponent } from '../../components/score-badge/score-badge.component';
import { formatScanDate } from '../../utils/format.util';
import { scoreClass, scoreLabel, typeLabel } from '../../utils/issue-categories';

@Component({
  selector: 'app-public-report',
  standalone: true,
  imports: [CommonModule, LoadingComponent, ErrorMessageComponent, ScoreBadgeComponent],
  templateUrl: './public-report.component.html',
  styleUrl: './public-report.component.css',
})
export class PublicReportComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly scanService = inject(ScanService);
  private readonly document = inject(DOCUMENT);

  report: PublicReport | null = null;
  loading = true;
  error: string | null = null;
  copyMessage: string | null = null;

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.error = 'Invalid report link.';
      this.loading = false;
      return;
    }

    this.scanService.getPublicReport(token).subscribe({
      next: (report) => {
        this.report = report;
        this.loading = false;
        this.document.title = `QA Report — ${report.title || report.url}`;
      },
      error: (err) => {
        this.error = err.error?.error || 'Report not found.';
        this.loading = false;
      },
    });
  }

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }

  healthLabel(): string {
    return scoreLabel(this.report?.score);
  }

  healthClass(): string {
    return scoreClass(this.report?.score);
  }

  typeLabel(type: string): string {
    return typeLabel(type);
  }

  issueTitle(issue: PublicReport['issues'][number]): string {
    if (issue.label && issue.label !== issue.message) {
      return `${issue.label}: ${issue.message}`;
    }
    return issue.label || issue.message;
  }

  screenshotUrl(path: string | null | undefined): string | null {
    return this.scanService.assetUrl(path);
  }

  printReport(): void {
    window.print();
  }

  async copyLink(): Promise<void> {
    const url = this.scanService.publicReportUrl(this.report?.token);
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      this.copyMessage = 'Link copied to clipboard.';
    } catch {
      this.copyMessage = 'Could not copy link automatically.';
    }

    setTimeout(() => {
      this.copyMessage = null;
    }, 2500);
  }
}
