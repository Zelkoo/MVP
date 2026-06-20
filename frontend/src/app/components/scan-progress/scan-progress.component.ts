import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

const DEFAULT_STEPS = [
  'Validating URL',
  'Launching browser',
  'Loading page and capturing metrics',
  'Checking links and accessibility',
  'Saving screenshots and report',
];

@Component({
  selector: 'app-scan-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scan-progress.component.html',
  styleUrl: './scan-progress.component.css',
})
export class ScanProgressComponent implements OnInit, OnDestroy {
  @Input() url = '';
  @Input() steps: string[] = DEFAULT_STEPS;

  activeStep = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.timer = setInterval(() => {
      this.activeStep.update((value) => (value < this.steps.length - 1 ? value + 1 : value));
    }, 4500);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
