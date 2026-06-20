import { Component, Input } from '@angular/core';
import { Scan } from '../../models/scan.model';
import { scanStats } from '../../utils/issue-categories';

@Component({
  selector: 'app-scan-stats-grid',
  standalone: true,
  templateUrl: './scan-stats-grid.component.html',
  styleUrl: './scan-stats-grid.component.css',
})
export class ScanStatsGridComponent {
  @Input({ required: true }) scan!: Scan;

  stats() {
    return scanStats(this.scan);
  }
}
