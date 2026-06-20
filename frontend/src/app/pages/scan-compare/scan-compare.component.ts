import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ScanService } from '../../services/scan.service';
import { Scan } from '../../models/scan.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { IssueListComponent } from '../../components/issue-list/issue-list.component';
import { ScoreBadgeComponent } from '../../components/score-badge/score-badge.component';
import { compareScans, ScanComparison } from '../../utils/scan-comparison.util';
import { sameDomain } from '../../utils/url.util';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-scan-compare',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
    IssueListComponent,
    ScoreBadgeComponent,
  ],
  templateUrl: './scan-compare.component.html',
  styleUrl: './scan-compare.component.css',
})
export class ScanCompareComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly scanService = inject(ScanService);

  loading = true;
  error: string | null = null;
  comparison: ScanComparison | null = null;

  ngOnInit(): void {
    const currentId = Number(this.route.snapshot.paramMap.get('id'));
    const previousId = Number(this.route.snapshot.paramMap.get('previousId'));

    if (!currentId || !previousId || Number.isNaN(currentId) || Number.isNaN(previousId)) {
      this.error = 'Invalid scan comparison.';
      this.loading = false;
      return;
    }

    forkJoin({
      current: this.scanService.getScan(currentId),
      previous: this.scanService.getScan(previousId),
    }).subscribe({
      next: ({ current, previous }) => {
        if (!sameDomain(current.url, previous.url)) {
          this.error = 'These scans are from different domains and cannot be compared.';
          this.loading = false;
          return;
        }

        this.comparison = compareScans(current, previous);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scans for comparison.';
        this.loading = false;
      },
    });
  }

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }

  scoreDiffLabel(): string {
    if (!this.comparison) return '';
    const diff = this.comparison.scoreDifference;
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  scoreDiffClass(): string {
    if (!this.comparison) return '';
    if (this.comparison.scoreDifference > 0) return 'positive';
    if (this.comparison.scoreDifference < 0) return 'negative';
    return 'neutral';
  }
}
