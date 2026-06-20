import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScanService } from '../../services/scan.service';
import { Scan, IssueCategory } from '../../models/scan.model';
import { ScanProgressComponent } from '../../components/scan-progress/scan-progress.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { ScanSummaryPanelComponent } from '../../components/scan-summary-panel/scan-summary-panel.component';
import { ScreenshotGalleryComponent, ScreenshotItem } from '../../components/screenshot-gallery/screenshot-gallery.component';
import { IssueCategorySectionComponent } from '../../components/issue-category-section/issue-category-section.component';
import { ISSUE_CATEGORIES, issuesForCategory } from '../../utils/issue-categories';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ScanProgressComponent,
    ErrorMessageComponent,
    ScanSummaryPanelComponent,
    ScreenshotGalleryComponent,
    IssueCategorySectionComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly scanService = inject(ScanService);
  private readonly router = inject(Router);

  url = '';
  loading = false;
  error: string | null = null;
  scan: Scan | null = null;
  categories = ISSUE_CATEGORIES;

  analyze(): void {
    const trimmed = this.url.trim();
    if (!trimmed) {
      this.error = 'Please enter a website URL.';
      return;
    }

    this.loading = true;
    this.error = null;
    this.scan = null;

    this.scanService.createScan(trimmed).subscribe({
      next: (result) => {
        this.scan = result;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        const body = err.error;
        if (body?.id) {
          this.scan = body;
          this.error = body.error || 'Scan completed with errors.';
        } else {
          this.error = body?.error || err.message || 'Failed to analyze website.';
        }
      },
    });
  }

  viewDetails(): void {
    if (this.scan?.id) {
      this.router.navigate(['/scans', this.scan.id]);
    }
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

  categoryIssues(category: IssueCategory) {
    return issuesForCategory(this.scan?.issues || [], category);
  }
}
