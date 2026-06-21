import { Component, ViewChild, inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { RouterLink } from '@angular/router';

import { ScenarioService } from '../../services/scenario.service';

import { FlowSuggestionService } from '../../services/flow-suggestion.service';

import { ErrorMessageComponent } from '../../components/error-message/error-message.component';

import { LoadingComponent } from '../../components/loading/loading.component';

import { PagePreviewPickerComponent } from '../../components/page-preview-picker/page-preview-picker.component';
import { SuccessConditionAssistantComponent } from '../../components/success-condition-assistant/success-condition-assistant.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';

import { InspectedElement, PageInspectionResult, previewStatusLabel } from '../../models/page-inspector.model';

import {

  FlowAnalysisResult,

  FlowSuggestion,

  SuccessStrategy,

} from '../../models/flow-suggestion.model';

import { FlowStepDefinition, serializeSteps } from '../../utils/flow-templates';

import {

  WIZARD_STEPS,

  WIZARD_TEST_OPTIONS,

  WizardTestType,

  WizardElementSlot,

  generateWizardSteps,

  plainStepDescription,

  developerStepPreview,

  createEmptySlotState,

  allSlotsFilled,

  currentSlotIndex,

  getDefaultSuccessType,

  getDefaultSuccessValue,

  SuccessConditionType,

  SUCCESS_CONDITION_OPTIONS,

} from '../../utils/flow-wizard';

import {

  analysisToInspection,

  allConfirmSlotsResolved,

  buildConfirmSlots,

  buildWizardFlowSteps,

  confidenceHint,

  confirmSlotElementIds,

  defaultSuccessStrategy,

  successStrategyPlainDescription,

  successStrategyTitle,

  WizardConfirmSlot,

} from '../../utils/wizard-from-suggestion';

import {

  confidenceBadgeClass,

  getSuccessStrategies,

  suggestionFlowName,

} from '../../utils/suggestion-to-flow';

import { ScenarioRun } from '../../models/scenario.model';
import { stepResultSummary } from '../../utils/element-target';
import { splitFlowSteps } from '../../utils/success-condition.util';



@Component({

  selector: 'app-scenario-wizard',

  standalone: true,

  imports: [

    CommonModule,

    FormsModule,

    RouterLink,

    ErrorMessageComponent,

    LoadingComponent,

    PagePreviewPickerComponent,

    SuccessConditionAssistantComponent,

    TestReliabilityScoreComponent,

  ],

  templateUrl: './scenario-wizard.component.html',

  styleUrl: './scenario-wizard.component.css',

})

export class ScenarioWizardComponent {

  @ViewChild('confirmPreview') confirmPreview?: PagePreviewPickerComponent;

  @ViewChild('manualPreview') manualPreview?: PagePreviewPickerComponent;



  private readonly scenarioService = inject(ScenarioService);

  private readonly suggestionService = inject(FlowSuggestionService);



  wizardSteps = WIZARD_STEPS;

  manualOptions = WIZARD_TEST_OPTIONS.filter((option) => option.id !== 'custom-flow');

  successOptions = SUCCESS_CONDITION_OPTIONS;



  currentStep = 1;

  error: string | null = null;

  analyzing = false;

  saving = false;

  running = false;

  showDevPreview = false;

  showAdvancedEditor = false;

  devDetailsOpen = new Set<number>();



  flowName = '';

  startUrl = '';

  analysis: FlowAnalysisResult | null = null;

  selectedSuggestion: FlowSuggestion | null = null;

  manualMode = false;

  manualTestType: WizardTestType | null = null;

  confirmSlots: WizardConfirmSlot[] = [];

  replacingSlotId: string | null = null;

  selectedSuccessStrategy: SuccessStrategy | null = null;

  manualSuccessType: SuccessConditionType = 'page-contains-text';

  manualSuccessValue = '';

  manualSuccessElement?: InspectedElement;

  manualElementSlots: WizardElementSlot[] = [];

  manualPreviewLoaded = false;

  generatedSteps: FlowStepDefinition[] = [];

  runResult: ScenarioRun | null = null;



  get progressPercent(): number {

    return Math.round((this.currentStep / this.wizardSteps.length) * 100);

  }



  get inspectionPreview(): PageInspectionResult | null {

    return this.analysis ? analysisToInspection(this.analysis) : null;

  }



  get analysisStatusLabel(): string {

    return previewStatusLabel(this.inspectionPreview, this.analyzing);

  }



  get analysisBlocked(): boolean {

    return this.analysis?.status === 'blocked' || this.analysis?.status === 'timeout';

  }



  get hasDetectedSuggestions(): boolean {

    return Boolean(this.analysis && this.analysis.suggestions.length > 0 && !this.analysisBlocked);

  }



  get highlightElementIds(): string[] {

    return confirmSlotElementIds(this.confirmSlots);

  }



  get confidenceMessage(): string {

    if (!this.selectedSuggestion) return '';

    return confidenceHint(this.selectedSuggestion.confidenceLabel);

  }



  get activeManualSlot(): WizardElementSlot | null {

    const index = currentSlotIndex(this.manualElementSlots);

    return index >= 0 ? this.manualElementSlots[index] : null;

  }



  get successStrategies(): SuccessStrategy[] {

    if (!this.selectedSuggestion) return [];

    return getSuccessStrategies(this.selectedSuggestion.generatedSteps);

  }



  get testLabel(): string {

    if (this.selectedSuggestion) return this.selectedSuggestion.title;

    const manual = this.manualOptions.find((option) => option.id === this.manualTestType);

    return manual?.title || 'Custom test';

  }



  analyzePage(): void {

    const url = this.startUrl.trim();

    if (!url) {

      this.error = 'Enter the page URL where your test should start.';

      return;

    }



    this.analyzing = true;

    this.error = null;

    this.analysis = null;

    this.selectedSuggestion = null;

    this.manualMode = false;

    this.manualTestType = null;

    this.confirmSlots = [];

    this.generatedSteps = [];

    this.runResult = null;



    this.suggestionService.analyzePage({ url, viewport: 'desktop' }).subscribe({

      next: (result) => {

        this.analysis = result;

        this.analyzing = false;

        if (!this.flowName.trim() && result.suggestions[0]) {

          this.flowName = suggestionFlowName(result.suggestions[0]);

        }

        this.currentStep = 2;

      },

      error: (err) => {

        this.analyzing = false;

        this.error = err.error?.error || 'Failed to analyze page.';

      },

    });

  }



  selectSuggestion(suggestion: FlowSuggestion): void {

    this.selectedSuggestion = suggestion;

    this.manualMode = false;

    this.manualTestType = null;

    this.flowName = suggestionFlowName(suggestion);

    this.confirmSlots = buildConfirmSlots(suggestion, this.analysis?.elements || []);

    this.selectedSuccessStrategy = defaultSuccessStrategy(suggestion);

    this.replacingSlotId = null;

    this.error = null;

  }



  selectManualType(type: WizardTestType): void {

    this.manualMode = true;

    this.manualTestType = type;

    this.selectedSuggestion = null;

    this.confirmSlots = [];

    this.manualElementSlots = createEmptySlotState(type);

    this.manualSuccessType = getDefaultSuccessType(type);

    this.manualSuccessValue = getDefaultSuccessValue(type, this.manualSuccessType);

    this.manualSuccessElement = undefined;

    this.manualPreviewLoaded = false;

    const option = this.manualOptions.find((entry) => entry.id === type);

    if (option && !this.flowName.trim()) {

      this.flowName = option.defaultName;

    }

    this.error = null;

  }



  startReplaceSlot(slot: WizardConfirmSlot): void {

    this.replacingSlotId = slot.id;

    this.error = null;

  }



  cancelReplace(): void {

    this.replacingSlotId = null;

  }



  onConfirmElementSelected(element: InspectedElement): void {

    if (!this.replacingSlotId) return;

    this.confirmSlots = this.confirmSlots.map((slot) =>

      slot.id === this.replacingSlotId ? { ...slot, element, replacing: false } : slot

    );

    this.replacingSlotId = null;

    this.error = null;

  }



  onManualElementSelected(element: InspectedElement): void {

    const index = currentSlotIndex(this.manualElementSlots);

    if (index < 0) return;

    this.manualElementSlots = this.manualElementSlots.map((slot, slotIndex) =>

      slotIndex === index ? { ...slot, element } : slot

    );

    this.error = null;

  }



  onManualPreviewLoaded(result: PageInspectionResult): void {

    this.manualPreviewLoaded =

      result.status === 'ok' || result.status === 'partial' || result.elements.length > 0;

  }



  selectSuccessStrategy(strategy: SuccessStrategy): void {

    this.selectedSuccessStrategy = strategy;

    this.refreshGeneratedSteps();

  }



  selectManualSuccessType(type: SuccessConditionType): void {

    this.manualSuccessType = type;

    if (this.manualTestType) {

      this.manualSuccessValue = getDefaultSuccessValue(this.manualTestType, type);

    }

    this.manualSuccessElement = undefined;

  }



  plainStep(step: FlowStepDefinition): string {

    return plainStepDescription(step, this.startUrl.trim());

  }



  devStep(step: FlowStepDefinition): string {

    return developerStepPreview(step);

  }



  confidenceClass(label: string): string {

    return confidenceBadgeClass(label);

  }



  strategyTitle(strategy: SuccessStrategy): string {

    return successStrategyTitle(strategy);

  }



  strategyDescription(strategy: SuccessStrategy): string {

    return successStrategyPlainDescription(strategy);

  }



  get assistantViewport(): { width: number; height: number } | undefined {

    return this.selectedSuggestion?.viewport === 'mobile' ? { width: 390, height: 844 } : undefined;

  }



  onAssistantStepsChange(steps: FlowStepDefinition[]): void {

    this.generatedSteps = steps;

  }



  refreshGeneratedSteps(): void {

    const url = this.startUrl.trim();

    if (this.selectedSuggestion && this.selectedSuccessStrategy) {

      this.generatedSteps = buildWizardFlowSteps(

        this.selectedSuggestion,

        url,

        this.confirmSlots,

        this.selectedSuccessStrategy

      );

      return;

    }



    if (this.manualMode && this.manualTestType) {

      this.generatedSteps = generateWizardSteps({

        testType: this.manualTestType,

        startUrl: url,

        elementSlots: this.manualElementSlots,

        successType: this.manualSuccessType,

        successValue: this.manualSuccessValue.trim(),

        successElement: this.manualSuccessElement,

      });

    }

  }



  nextStep(): void {

    this.error = null;



    if (this.currentStep === 1) {

      if (!this.startUrl.trim()) {

        this.error = 'Enter a page URL, then click Analyze page.';

        return;

      }

      if (!this.analysis) {

        this.analyzePage();

        return;

      }

    }



    if (this.currentStep === 2) {

      if (!this.selectedSuggestion && !this.manualTestType) {

        this.error = this.hasDetectedSuggestions

          ? 'Pick one of the detected tests, or choose a manual option below.'

          : 'Pick a manual test type to continue.';

        return;

      }

    }



    if (this.currentStep === 3) {

      if (this.selectedSuggestion) {

        if (!allConfirmSlotsResolved(this.confirmSlots)) {

          this.error = 'Some elements could not be matched. Replace them on the preview or pick a different test.';

          return;

        }

      } else if (this.manualMode) {

        if (!this.manualPreviewLoaded) {

          this.error = 'Load the page preview before continuing.';

          return;

        }

        if (!allSlotsFilled(this.manualElementSlots)) {

          this.error = 'Select all required elements on the screenshot.';

          return;

        }

      }

      if (this.selectedSuggestion && this.selectedSuccessStrategy) {
        this.refreshGeneratedSteps();
      }

    }



    if (this.currentStep === 4) {

      if (this.selectedSuggestion) {
        const { assertionSteps } = splitFlowSteps(this.generatedSteps);
        if (assertionSteps.length === 0) {
          this.error = 'Select at least one recommended success check.';
          return;
        }
      } else if (this.manualMode) {

        if (this.manualSuccessType === 'element-visible' && !this.manualSuccessElement) {

          this.error = 'Select the element that proves success on the preview.';

          return;

        }

        if (

          (this.manualSuccessType === 'url-contains' || this.manualSuccessType === 'page-contains-text') &&

          !this.manualSuccessValue.trim()

        ) {

          this.error = 'Enter the success value for this test.';

          return;

        }

      }

      if (!this.selectedSuggestion) {
        this.refreshGeneratedSteps();
      }

    }



    if (this.currentStep === 5) {

      if (this.generatedSteps.length === 0) {

        this.refreshGeneratedSteps();

      }

      if (this.generatedSteps.length === 0) {

        this.error = 'Your test is not ready yet.';

        return;

      }

    }



    if (this.currentStep < this.wizardSteps.length) {

      this.currentStep += 1;

    }

  }



  previousStep(): void {

    this.error = null;

    if (this.currentStep > 1) {

      this.currentStep -= 1;

    }

  }



  goToStep(step: number): void {

    if (step < this.currentStep) {

      this.currentStep = step;

      this.error = null;

    }

  }



  updateGeneratedStep(index: number, patch: Partial<FlowStepDefinition>): void {

    this.generatedSteps = this.generatedSteps.map((step, stepIndex) =>

      stepIndex === index ? { ...step, ...patch } : step

    );

  }



  saveAndRun(): void {

    if (this.generatedSteps.length === 0) {

      this.refreshGeneratedSteps();

    }

    if (this.generatedSteps.length === 0) {

      this.error = 'Your test is not ready yet.';

      return;

    }



    this.saving = true;

    this.running = true;

    this.error = null;

    this.runResult = null;



    this.scenarioService

      .createScenario({

        name: this.flowName.trim() || this.testLabel,

        type: 'flow',

        startUrl: this.startUrl.trim(),

        config: {

          steps: serializeSteps(this.generatedSteps, this.startUrl.trim()),

          viewport:

            this.selectedSuggestion?.viewport === 'mobile' ? { width: 390, height: 844 } : undefined,

        },

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



  runScreenshotUrl(): string | null {

    return this.scenarioService.screenshotUrl(this.runResult?.screenshotPath);

  }



  stepScreenshot(path: string | null | undefined): string | null {

    return this.scenarioService.screenshotUrl(path);

  }



  runStatusClass(): string {
    return `status-${this.runResult?.status || 'unknown'}`;
  }

  manualSuccessInputLabel(): string {
    return this.successOptions.find((option) => option.id === this.manualSuccessType)?.inputLabel || '';
  }

  manualSuccessPlaceholder(): string {
    return this.successOptions.find((option) => option.id === this.manualSuccessType)?.placeholder || '';
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

  runStepHasDevDetails(step: ScenarioRun['result']['steps'][number]): boolean {
    return Boolean(step.attempts?.length || step.technicalDetails);
  }
}


