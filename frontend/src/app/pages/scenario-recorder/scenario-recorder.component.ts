import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { LoadingComponent } from '../../components/loading/loading.component';
import { PagePreviewPickerComponent } from '../../components/page-preview-picker/page-preview-picker.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';
import { InspectedElement, PageInspectionResult } from '../../models/page-inspector.model';
import { ScenarioRun } from '../../models/scenario.model';
import { FlowStepDefinition, serializeSteps } from '../../utils/flow-templates';
import {
  SUCCESS_CONDITION_OPTIONS,
  SuccessConditionType,
  plainStepDescription,
  developerStepPreview,
} from '../../utils/flow-wizard';
import {
  RECORDER_PHASES,
  RecordedAction,
  RecordedActionType,
  buildRecordedFlowSteps,
  createRecordedAction,
  defaultFillValue,
  plainRecordedAction,
  recordedActionLabel,
  suggestRecordedAction,
} from '../../utils/flow-recorder';
import { stepResultSummary } from '../../utils/element-target';

@Component({
  selector: 'app-scenario-recorder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ErrorMessageComponent,
    LoadingComponent,
    PagePreviewPickerComponent,
    TestReliabilityScoreComponent,
  ],
  templateUrl: './scenario-recorder.component.html',
  styleUrl: './scenario-recorder.component.css',
})
export class ScenarioRecorderComponent {
  @ViewChild(PagePreviewPickerComponent) previewPicker?: PagePreviewPickerComponent;

  private readonly scenarioService = inject(ScenarioService);
  private readonly router = inject(Router);

  phases = RECORDER_PHASES;
  successOptions = SUCCESS_CONDITION_OPTIONS;

  currentStep = 1;
  error: string | null = null;
  recording = false;
  saving = false;
  running = false;
  showDevPreview = false;
  devDetailsOpen = new Set<number>();

  flowName = '';
  startUrl = '';
  previewLoaded = false;
  inspection: PageInspectionResult | null = null;
  recordedActions: RecordedAction[] = [];
  pendingElement: InspectedElement | null = null;
  pendingAction: RecordedActionType = 'click';
  pendingFillValue = '';

  successType: SuccessConditionType = 'page-contains-text';
  successValue = 'thank';
  successElement?: InspectedElement;
  pickingSuccessElement = false;

  generatedSteps: FlowStepDefinition[] = [];
  runResult: ScenarioRun | null = null;

  get progressPercent(): number {
    return Math.round((this.currentStep / this.phases.length) * 100);
  }

  get recordedElementIds(): string[] {
    return this.recordedActions.map((entry) => entry.element.id);
  }

  get canStopRecording(): boolean {
    return this.recordedActions.length > 0;
  }

  startRecording(): void {
    const url = this.startUrl.trim();
    if (!url) {
      this.error = 'Enter the page URL where recording should start.';
      return;
    }

    if (!this.flowName.trim()) {
      this.flowName = 'Recorded flow test';
    }

    this.error = null;
    this.recording = true;
    this.currentStep = 2;
    this.recordedActions = [];
    this.pendingElement = null;
    this.generatedSteps = [];
    this.runResult = null;

    setTimeout(() => this.previewPicker?.loadPreview(), 0);
  }

  onPreviewLoaded(result: PageInspectionResult): void {
    this.inspection = result;
    this.previewLoaded = result.status === 'ok' || result.status === 'partial' || result.elements.length > 0;
    if (!this.previewLoaded) {
      this.error = 'Page preview did not load reliably. Retry or use another URL.';
    }
  }

  onElementPicked(element: InspectedElement): void {
    if (this.pickingSuccessElement) {
      this.successElement = element;
      this.pickingSuccessElement = false;
      this.error = null;
      return;
    }

    this.pendingElement = element;
    this.pendingAction = suggestRecordedAction(element);
    this.pendingFillValue = defaultFillValue(element);
    this.error = null;
  }

  confirmPendingAction(): void {
    if (!this.pendingElement) return;

    this.recordedActions = [
      ...this.recordedActions,
      createRecordedAction(this.pendingElement, this.pendingAction, this.pendingFillValue),
    ];
    this.pendingElement = null;
    this.error = null;
  }

  cancelPendingAction(): void {
    this.pendingElement = null;
  }

  removeRecordedAction(id: string): void {
    this.recordedActions = this.recordedActions.filter((entry) => entry.id !== id);
  }

  moveRecordedAction(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.recordedActions.length) return;
    const next = [...this.recordedActions];
    [next[index], next[target]] = [next[target], next[index]];
    this.recordedActions = next;
  }

  stopRecording(): void {
    if (!this.canStopRecording) {
      this.error = 'Record at least one action before stopping.';
      return;
    }
    this.recording = false;
    this.pendingElement = null;
    this.currentStep = 3;
    this.error = null;
  }

  selectSuccessType(type: SuccessConditionType): void {
    this.successType = type;
    if (type === 'page-contains-text') this.successValue = 'thank';
    if (type === 'url-contains') this.successValue = '/thank';
    this.successElement = undefined;
    this.pickingSuccessElement = false;
  }

  successInputLabel(): string {
    return this.successOptions.find((option) => option.id === this.successType)?.inputLabel || '';
  }

  successPlaceholder(): string {
    return this.successOptions.find((option) => option.id === this.successType)?.placeholder || '';
  }

  buildGeneratedSteps(): void {
    this.generatedSteps = buildRecordedFlowSteps({
      startUrl: this.startUrl.trim(),
      actions: this.recordedActions,
      successType: this.successType,
      successValue: this.successValue.trim(),
      successElement: this.successElement,
    });
  }

  plainStep(step: FlowStepDefinition): string {
    return plainStepDescription(step, this.startUrl.trim());
  }

  devStep(step: FlowStepDefinition): string {
    return developerStepPreview(step);
  }

  actionLabel(type: RecordedActionType): string {
    return recordedActionLabel(type);
  }

  describeRecordedAction(entry: RecordedAction): string {
    return plainRecordedAction(entry);
  }

  nextStep(): void {
    this.error = null;

    if (this.currentStep === 3) {
      if (this.successType === 'element-visible' && !this.successElement) {
        this.error = 'Select the element that proves success, or pick another success check.';
        return;
      }
      if (
        (this.successType === 'url-contains' || this.successType === 'page-contains-text') &&
        !this.successValue.trim()
      ) {
        this.error = 'Enter a value for the success check.';
        return;
      }
    }

    if (this.currentStep === 3) {
      this.buildGeneratedSteps();
    }

    if (this.currentStep < this.phases.length) {
      this.currentStep += 1;
    }
  }

  previousStep(): void {
    this.error = null;
    if (this.currentStep === 3) {
      this.recording = true;
    }
    if (this.currentStep > 1) {
      this.currentStep -= 1;
    }
  }

  saveAndRun(): void {
    if (this.generatedSteps.length === 0) {
      this.buildGeneratedSteps();
    }
    if (this.generatedSteps.length === 0) {
      this.error = 'Your recorded flow is not ready yet.';
      return;
    }

    this.saving = true;
    this.running = true;
    this.error = null;
    this.runResult = null;

    this.scenarioService
      .createScenario({
        name: this.flowName.trim(),
        type: 'flow',
        startUrl: this.startUrl.trim(),
        config: { steps: serializeSteps(this.generatedSteps, this.startUrl.trim()) },
      })
      .subscribe({
        next: (scenario) => {
          if (!scenario.id) {
            this.saving = false;
            this.running = false;
            this.error = 'Failed to save the test.';
            return;
          }

          this.scenarioService.runScenario(scenario.id).subscribe({
            next: (run) => {
              this.saving = false;
              this.running = false;
              this.runResult = run;
            },
            error: (err) => {
              this.saving = false;
              this.running = false;
              if (err.error?.id) {
                this.scenarioService.getScenarioRun(err.error.id).subscribe({
                  next: (run) => {
                    this.runResult = run;
                  },
                });
                return;
              }
              this.error = err.error?.error || 'The test was saved but the run failed.';
            },
          });
        },
        error: (err) => {
          this.saving = false;
          this.running = false;
          this.error = err.error?.error || 'Failed to save the test.';
        },
      });
  }

  saveOnly(): void {
    if (this.generatedSteps.length === 0) {
      this.buildGeneratedSteps();
    }

    this.saving = true;
    this.error = null;

    this.scenarioService
      .createScenario({
        name: this.flowName.trim(),
        type: 'flow',
        startUrl: this.startUrl.trim(),
        config: { steps: serializeSteps(this.generatedSteps, this.startUrl.trim()) },
      })
      .subscribe({
        next: (scenario) => {
          this.saving = false;
          if (scenario.id) {
            this.router.navigate(['/scenarios', scenario.id]);
          }
        },
        error: (err) => {
          this.saving = false;
          this.error = err.error?.error || 'Failed to save the test.';
        },
      });
  }

  toggleDevDetails(index: number): void {
    if (this.devDetailsOpen.has(index)) {
      this.devDetailsOpen.delete(index);
    } else {
      this.devDetailsOpen.add(index);
    }
  }

  devDetailsVisible(index: number): boolean {
    return this.devDetailsOpen.has(index);
  }

  runStepSummary(step: ScenarioRun['result']['steps'][number]): string {
    return stepResultSummary({
      name: step.name,
      action: step.action,
      status: step.status,
      message: step.message,
      selectorStrategy: step.selectorStrategy,
    });
  }

  runScreenshotUrl(): string | null {
    return this.scenarioService.screenshotUrl(this.runResult?.screenshotPath);
  }

  runStatusClass(): string {
    return `status-${this.runResult?.status || 'unknown'}`;
  }
}
