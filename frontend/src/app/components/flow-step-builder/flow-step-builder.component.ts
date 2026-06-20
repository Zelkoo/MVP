import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FlowStepDefinition,
  FlowStepAction,
  FLOW_STEP_OPTIONS,
  actionLabel,
  createStepId,
} from '../../utils/flow-templates';

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
  @Output() stepsChange = new EventEmitter<FlowStepDefinition[]>();

  stepOptions = FLOW_STEP_OPTIONS;
  newAction: FlowStepAction = 'click';

  actionLabel(action: FlowStepAction): string {
    return actionLabel(action);
  }

  emitSteps(steps: FlowStepDefinition[]): void {
    this.steps = steps;
    this.stepsChange.emit(steps);
  }

  addStep(): void {
    const step: FlowStepDefinition = {
      id: createStepId(),
      action: this.newAction,
      label: `${this.steps.length + 1}. ${actionLabel(this.newAction)}`,
    };

    if (step.action === 'goto') {
      step.url = this.startUrl;
    }
    if (step.action === 'waitForText') {
      step.timeoutMs = 8000;
    }

    this.emitSteps([...this.steps, step]);
  }

  removeStep(index: number): void {
    const next = this.steps.filter((_, i) => i !== index);
    this.emitSteps(next);
  }

  moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.steps.length) return;

    const next = [...this.steps];
    [next[index], next[target]] = [next[target], next[index]];
    this.emitSteps(next);
  }

  updateStep(index: number, patch: Partial<FlowStepDefinition>): void {
    const next = this.steps.map((step, i) => (i === index ? { ...step, ...patch } : step));
    this.emitSteps(next);
  }

  trackStep(_index: number, step: FlowStepDefinition): string {
    return step.id;
  }
}
