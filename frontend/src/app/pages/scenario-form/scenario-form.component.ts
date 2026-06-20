import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { FlowStepBuilderComponent } from '../../components/flow-step-builder/flow-step-builder.component';
import {
  FlowStepDefinition,
  FLOW_TEMPLATES,
  serializeSteps,
  withStepIds,
} from '../../utils/flow-templates';

@Component({
  selector: 'app-scenario-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ErrorMessageComponent, FlowStepBuilderComponent],
  templateUrl: './scenario-form.component.html',
  styleUrl: './scenario-form.component.css',
})
export class ScenarioFormComponent {
  private readonly scenarioService = inject(ScenarioService);
  private readonly router = inject(Router);

  templates = FLOW_TEMPLATES;
  saving = false;
  error: string | null = null;

  name = '';
  startUrl = '';
  steps: FlowStepDefinition[] = [];

  save(): void {
    if (!this.name.trim() || !this.startUrl.trim()) {
      this.error = 'Flow name and start URL are required.';
      return;
    }

    if (this.steps.length === 0) {
      this.error = 'Add at least one step to your flow.';
      return;
    }

    this.saving = true;
    this.error = null;

    this.scenarioService
      .createScenario({
        name: this.name.trim(),
        type: 'flow',
        startUrl: this.startUrl.trim(),
        config: { steps: serializeSteps(this.steps, this.startUrl.trim()) },
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
          this.error = err.error?.error || 'Failed to save flow.';
        },
      });
  }

  applyTemplate(templateId: string): void {
    const template = this.templates.find((entry) => entry.id === templateId);
    if (!template) return;

    const url = this.startUrl.trim() || 'https://yoursite.com';
    this.name = template.scenarioName;
    this.steps = withStepIds(template.steps(url));
    if (!this.startUrl.trim()) {
      this.startUrl = url;
    }
  }

  onStepsChange(steps: FlowStepDefinition[]): void {
    this.steps = steps;
  }
}
