import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InspectedElement } from '../../models/page-inspector.model';
import {
  FlowStepDefinition,
  FlowStepAction,
  FLOW_STEP_OPTIONS,
  actionLabel,
  stepSummary,
  supportsElementPicker,
  suggestedActionFromElement,
} from '../../utils/flow-templates';
import { buildElementTargetFields } from '../../utils/element-target';

@Component({
  selector: 'app-flow-step-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './flow-step-builder.component.html',
  styleUrl: './flow-step-builder.component.css',
})
export class FlowStepBuilderComponent {
  @Input({ required: true }) steps: FlowStepDefinition[] = [];
  @Input() startUrl = '';
  @Input() activeStepIndex = 0;

  @Output() stepsChange = new EventEmitter<FlowStepDefinition[]>();
  @Output() activeStepChange = new EventEmitter<number>();

  stepOptions = FLOW_STEP_OPTIONS;
  newAction: FlowStepAction = 'click';

  actionLabel(action: FlowStepAction): string {
    return actionLabel(action);
  }

  stepSummary(step: FlowStepDefinition): string {
    return stepSummary(step, this.startUrl);
  }

  supportsPicker(action: FlowStepAction): boolean {
    return supportsElementPicker(action);
  }

  activeStep(): FlowStepDefinition | null {
    return this.steps[this.activeStepIndex] ?? null;
  }

  selectStep(index: number): void {
    this.activeStepChange.emit(index);
  }

  emitSteps(steps: FlowStepDefinition[]): void {
    this.steps = steps;
    this.stepsChange.emit(steps);
  }

  addStep(): void {
    const step: FlowStepDefinition = {
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: this.newAction,
      label: `${this.steps.length + 1}. ${actionLabel(this.newAction)}`,
    };

    if (step.action === 'goto') {
      step.url = this.startUrl;
    }
    if (step.action === 'waitForText') {
      step.timeoutMs = 8000;
    }

    const next = [...this.steps, step];
    this.emitSteps(next);
    this.activeStepChange.emit(next.length - 1);
  }

  removeStep(index: number): void {
    const next = this.steps.filter((_, i) => i !== index);
    this.emitSteps(next);
    const nextIndex = Math.min(this.activeStepIndex, Math.max(0, next.length - 1));
    this.activeStepChange.emit(nextIndex);
  }

  moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.steps.length) return;

    const next = [...this.steps];
    [next[index], next[target]] = [next[target], next[index]];
    this.emitSteps(next);
    this.activeStepChange.emit(target);
  }

  updateStep(index: number, patch: Partial<FlowStepDefinition>): void {
    const next = this.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    this.emitSteps(next);
  }

  toggleAdvanced(index: number): void {
    const step = this.steps[index];
    this.updateStep(index, { showAdvanced: !step.showAdvanced });
  }

  applySelectedElement(element: InspectedElement, stepIndex = this.activeStepIndex): void {
    const step = this.steps[stepIndex];
    if (!step) return;

    const targetFields = buildElementTargetFields(element);
    const patch: Partial<FlowStepDefinition> = {
      ...targetFields,
      label: step.label || `${actionLabel(step.action)}: ${element.label}`,
    };

    if (step.action === 'fill') {
      this.updateStep(stepIndex, patch);
      return;
    }

    if (step.action === 'click' || step.action === 'expectVisible') {
      this.updateStep(stepIndex, patch);
      return;
    }

    const suggested = suggestedActionFromElement(element.actionTypeSuggestions, 'click');
    this.updateStep(stepIndex, {
      ...patch,
      action: suggested,
      label: `${actionLabel(suggested)}: ${element.label}`,
    });
  }

  trackStep(_index: number, step: FlowStepDefinition): string {
    return step.id;
  }
}
