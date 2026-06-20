import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ScanService } from '../../services/scan.service';
import { Issue, IssueCategory, Scan, ScanPage } from '../../models/scan.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { ScanSummaryPanelComponent } from '../../components/scan-summary-panel/scan-summary-panel.component';
import { ScreenshotGalleryComponent, ScreenshotItem } from '../../components/screenshot-gallery/screenshot-gallery.component';
import { IssueCategorySectionComponent } from '../../components/issue-category-section/issue-category-section.component';
import { IssueListComponent } from '../../components/issue-list/issue-list.component';
import { IssueFiltersComponent } from '../../components/issue-filters/issue-filters.component';
import {
  ISSUE_CATEGORIES,
  isSiteWideIssue,
  issuesForCategory,
  scanStats,
} from '../../utils/issue-categories';
import {
  DEFAULT_ISSUE_FILTERS,
  filterIssues,
  hasActiveFilters,
  IssueFilters,
} from '../../utils/issue-filter.util';
import { formatScanDate } from '../../utils/format.util';
import { getDomain, sameDomain } from '../../utils/url.util';

@Component({
  selector: 'app-scan-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
    ScanSummaryPanelComponent,
    ScreenshotGalleryComponent,
    IssueCategorySectionComponent,
    IssueListComponent,
    IssueFiltersComponent,
  ],
  templateUrl: './scan-detail.component.html',
  styleUrl: './scan-detail.component.css',
})
export class ScanDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly scanService = inject(ScanService);

  scan: Scan | null = null;
  relatedScans: Scan[] = [];
  shareMessage: string | null = null;
  loading = true;
  error: string | null = null;
  categories: IssueCategory[] = ISSUE_CATEGORIES;
  filters: IssueFilters = { ...DEFAULT_ISSUE_FILTERS };

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error = 'Invalid scan ID.';
      this.loading = false;
      return;
    }

    this.scanService.getScan(id).subscribe({
      next: (scan) => {
        this.scan = scan;
        this.loadRelatedScans(scan);
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scan details.';
        this.loading = false;
      },
    });
  }

  onFiltersChange(filters: IssueFilters): void {
    this.filters = filters;
  }

  stats() {
    return scanStats(this.scan || { url: '', issues: [] });
  }

  allIssues(): Issue[] {
    return this.scan?.issues || [];
  }

  filteredIssues(): Issue[] {
    return filterIssues(this.allIssues(), this.filters);
  }

  siteWideIssues(): Issue[] {
    return this.filteredIssues().filter((issue) => isSiteWideIssue(issue));
  }

  categoryIssues(category: IssueCategory): Issue[] {
    return issuesForCategory(this.filteredIssues(), category).filter(
      (issue) => !isSiteWideIssue(issue)
    );
  }

  visibleCategoryCount(): number {
    return this.categories.filter((category) => this.categoryIssues(category).length > 0).length;
  }

  hasActiveFilters(): boolean {
    return hasActiveFilters(this.filters);
  }

  hasCrawlPages(): boolean {
    return (this.scan?.pages?.length || 0) > 0;
  }

  isPartialScan(): boolean {
    if (!this.scan) return false;
    if (this.scan.status === 'partial' || this.scan.status === 'failed') {
      return true;
    }

    return (this.scan.issues || []).some(
      (issue) =>
        isSiteWideIssue(issue) &&
        /timeout|crawl failed|scan stopped|partial/i.test(issue.message)
    );
  }

  isCleanScan(): boolean {
    return this.allIssues().length === 0;
  }

  noMatchingIssues(): boolean {
    return this.allIssues().length > 0 && this.filteredIssues().length === 0;
  }

  screenshots(): ScreenshotItem[] {
    if (!this.scan) return [];

    const items: ScreenshotItem[] = [];
    const desktop = this.scanService.screenshotUrl(this.scan.desktopScreenshotPath);
    const mobile = this.scanService.screenshotUrl(this.scan.mobileScreenshotPath);

    if (desktop) items.push({ label: 'Desktop (1440×900)', src: desktop });
    if (mobile) items.push({ label: 'Mobile (390×844)', src: mobile });
    return items;
  }

  formatDate(dateStr: string | undefined): string {
    return formatScanDate(dateStr);
  }

  pageLabel(page: ScanPage): string {
    return page.title || page.url;
  }

  private loadRelatedScans(scan: Scan): void {
    this.scanService.getScans().subscribe({
      next: (scans) => {
        this.relatedScans = scans.filter(
          (entry) => entry.id !== scan.id && sameDomain(entry.url, scan.url)
        );
      },
    });
  }

  previousScan(): Scan | null {
    return this.relatedScans[0] || null;
  }

  compareLink(previous: Scan): (string | number)[] {
    return ['/scans', this.scan?.id || 0, 'compare', previous.id || 0];
  }

  scanDomain(): string {
    return getDomain(this.scan?.url || '') || this.scan?.url || '';
  }

  publicReportUrl(): string | null {
    return this.scanService.publicReportUrl(this.scan?.publicToken);
  }

  openPublicReport(): void {
    const url = this.publicReportUrl();
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  printPublicReport(): void {
    const url = this.publicReportUrl();
    if (!url) return;

    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!printWindow) return;

    printWindow.addEventListener('load', () => {
      printWindow.focus();
      printWindow.print();
    });
  }

  async copyPublicLink(): Promise<void> {
    const url = this.publicReportUrl();
    if (!url) {
      this.shareMessage = 'Public report link is not available yet.';
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.shareMessage = 'Public report link copied to clipboard.';
    } catch {
      this.shareMessage = 'Could not copy link automatically.';
    }

    setTimeout(() => {
      this.shareMessage = null;
    }, 2500);
  }
}
