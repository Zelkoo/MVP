import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowStepDefinition } from '../../utils/flow-templates';
import { TestReliabilityResult } from '../../models/test-reliability.model';
import {
  computeFlowStepsReliability,
  computeTestReliability,
  reliabilityBadgeClass,
  reliabilityScoreClass,
} from '../../utils/test-reliability.util';

@Component({
  selector: 'app-test-reliability-score',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-reliability-score.component.html',
  styleUrl: './test-reliability-score.component.css',
})
export class TestReliabilityScoreComponent implements OnChanges {
  @Input() steps: FlowStepDefinition[] = [];
  @Input() startUrl = '';
  @Input() scenarioType = 'flow';
  @Input() config: Record<string, unknown> | null = null;
  @Input() compact = false;
  @Input() showFactors = false;

  result: TestReliabilityResult | null = null;

  ngOnChanges(): void {
    this.refreshScore();
  }

  refreshScore(): void {
    if (this.steps.length > 0) {
      this.result = computeFlowStepsReliability(this.steps, this.startUrl.trim());
      return;
    }

    if (this.config) {
      this.result = computeTestReliability({
        type: this.scenarioType,
        startUrl: this.startUrl.trim(),
        config: this.config,
      });
      return;
    }

    this.result = null;
  }

  badgeClass(): string {
    return this.result ? reliabilityBadgeClass(this.result.badge) : '';
  }

  scoreClass(): string {
    return this.result ? reliabilityScoreClass(this.result.score) : '';
  }
}
