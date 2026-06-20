import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scan } from '../../models/scan.model';
import { ScoreBadgeComponent } from '../score-badge/score-badge.component';
import { formatScanDate } from '../../utils/format.util';
import { scanStats, scoreClass, scoreLabel } from '../../utils/issue-categories';

@Component({
  selector: 'app-scan-summary-panel',
  standalone: true,
  imports: [CommonModule, ScoreBadgeComponent],
  templateUrl: './scan-summary-panel.component.html',
  styleUrl: './scan-summary-panel.component.css',
})
export class ScanSummaryPanelComponent {
  @Input({ required: true }) scan!: Scan;

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }

  displayScore(): number {
    return this.scan.score ?? 100;
  }

  stats() {
    return scanStats(this.scan);
  }

  healthLabel(): string {
    if (this.scan.status === 'failed') return 'Scan failed';
    if (this.scan.status === 'partial') return 'Partial report';
    return scoreLabel(this.displayScore());
  }

  healthClass(): string {
    if (this.scan.status === 'failed') return 'bad';
    if (this.scan.status === 'partial') return 'partial';
    return scoreClass(this.displayScore());
  }
}
