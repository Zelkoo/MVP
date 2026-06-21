import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FlowAnalysisService } from '../../services/flow-analysis.service';
import { LoadingComponent } from '../loading/loading.component';
import { ErrorMessageComponent } from '../error-message/error-message.component';
import { FlowStepDefinition } from '../../utils/flow-templates';
import { serializeSteps } from '../../utils/flow-templates';
import {
  SuccessConditionSuggestion,
  applySelectedSuccessConditions,
  confidenceBadgeClass,
  splitFlowSteps,
  suggestionSelectionKey,
} from '../../utils/success-condition.util';

@Component({
  selector: 'app-success-condition-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingComponent, ErrorMessageComponent],
  templateUrl: './success-condition-assistant.component.html',
  styleUrl: './success-condition-assistant.component.css',
})
export class SuccessConditionAssistantComponent implements OnChanges {
  private readonly flowAnalysisService = inject(FlowAnalysisService);

  @Input({ required: true }) startUrl = '';
  @Input({ required: true }) steps: FlowStepDefinition[] = [];
  @Input() viewport?: { width: number; height: number };
  @Input() autoAnalyze = true;

  @Output() stepsChange = new EventEmitter<FlowStepDefinition[]>();
  @Output() selectedChange = new EventEmitter<SuccessConditionSuggestion[]>();

  analyzing = false;
  error: string | null = null;
  suggestions: SuccessConditionSuggestion[] = [];
  selectedIds = new Set<string>();
  showDeveloperDetails = false;
  analysisStatus: string | null = null;
  triggerStepLabel: string | null = null;
  beforeScreenshotUrl: string | null = null;
  afterScreenshotUrl: string | null = null;
  hasAnalyzed = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.autoAnalyze) return;

    const stepsReady = this.steps.length > 0 && this.startUrl.trim();
    const urlChanged = Boolean(changes['startUrl'] && !changes['startUrl'].firstChange);
    const stepsInitialized = Boolean(changes['steps']?.firstChange);

    if (stepsReady && (urlChanged || stepsInitialized)) {
      this.analyze();
    }
  }

  analyze(): void {
    const url = this.startUrl.trim();
    if (!url || this.steps.length === 0) {
      this.error = 'Add flow steps before analyzing success conditions.';
      return;
    }

    const { actionSteps } = splitFlowSteps(this.steps);
    if (actionSteps.length === 0) {
      this.error = 'Add at least one action step before analyzing success conditions.';
      return;
    }

    this.analyzing = true;
    this.error = null;
    this.suggestions = [];
    this.selectedIds.clear();

    this.flowAnalysisService
      .analyzeSuccessConditions({
        startUrl: url,
        steps: serializeSteps(actionSteps, url),
        viewport: this.viewport,
      })
      .subscribe({
        next: (result) => {
          this.analyzing = false;
          this.hasAnalyzed = true;
          this.suggestions = result.suggestions || [];
          this.analysisStatus = result.status;
          this.triggerStepLabel = result.triggerStepLabel || null;
          this.beforeScreenshotUrl = this.flowAnalysisService.screenshotUrl(result.beforeScreenshotPath);
          this.afterScreenshotUrl = this.flowAnalysisService.screenshotUrl(result.afterScreenshotPath);

          if (result.error && result.status !== 'ok') {
            this.error = result.error;
          }

          if (this.suggestions.length > 0) {
            const top = this.suggestions.find((entry) => entry.confidence === 'high') || this.suggestions[0];
            this.selectedIds.add(suggestionSelectionKey(top));
            this.emitSelection();
          } else if (!result.error) {
            this.error = 'No strong success signals were detected. Try running the flow manually or pick a check below.';
          }
        },
        error: (err) => {
          this.analyzing = false;
          this.hasAnalyzed = true;
          this.error = err.error?.error || 'Failed to analyze success conditions.';
        },
      });
  }

  isSelected(suggestion: SuccessConditionSuggestion): boolean {
    return this.selectedIds.has(suggestionSelectionKey(suggestion));
  }

  toggleSuggestion(suggestion: SuccessConditionSuggestion): void {
    const key = suggestionSelectionKey(suggestion);
    if (this.selectedIds.has(key)) {
      this.selectedIds.delete(key);
    } else {
      this.selectedIds.add(key);
    }
    this.emitSelection();
  }

  confidenceClass(level: string): string {
    return confidenceBadgeClass(level as 'high' | 'medium' | 'low');
  }

  developerDetailsText(suggestion: SuccessConditionSuggestion): string {
    if (!suggestion.developerDetails) return '';
    return JSON.stringify(suggestion.developerDetails, null, 2);
  }

  private emitSelection(): void {
    const selected = this.suggestions.filter((entry) => this.selectedIds.has(suggestionSelectionKey(entry)));
    this.selectedChange.emit(selected);

    const { actionSteps, screenshotSteps } = splitFlowSteps(this.steps);
    const merged = applySelectedSuccessConditions(actionSteps, selected, screenshotSteps);
    this.stepsChange.emit(merged);
  }
}
