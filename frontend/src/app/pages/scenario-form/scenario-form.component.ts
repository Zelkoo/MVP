import { Component, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { FlowStepBuilderComponent } from '../../components/flow-step-builder/flow-step-builder.component';
import { PagePreviewPickerComponent } from '../../components/page-preview-picker/page-preview-picker.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';
import { InspectedElement } from '../../models/page-inspector.model';
import {
  FlowStepDefinition,
  FLOW_TEMPLATES,
  serializeSteps,
  withStepIds,
} from '../../utils/flow-templates';

@Component({
  selector: 'app-scenario-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    ErrorMessageComponent,
    FlowStepBuilderComponent,
    PagePreviewPickerComponent,
    TestReliabilityScoreComponent,
  ],
  templateUrl: './scenario-form.component.html',
  styleUrl: './scenario-form.component.css',
})
export class ScenarioFormComponent implements OnInit {
  @ViewChild(FlowStepBuilderComponent) stepBuilder?: FlowStepBuilderComponent;

  private readonly scenarioService = inject(ScenarioService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  templates = FLOW_TEMPLATES;
  saving = false;
  error: string | null = null;

  name = '';
  startUrl = '';
  steps: FlowStepDefinition[] = [];
  activeStepIndex = 0;

  ngOnInit(): void {
    const url = this.route.snapshot.queryParamMap.get('url');
    const name = this.route.snapshot.queryParamMap.get('name');
    if (url) this.startUrl = url;
    if (name) this.name = name;
  }

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
    this.activeStepIndex = 0;
    if (!this.startUrl.trim()) {
      this.startUrl = url;
    }
  }

  onStepsChange(steps: FlowStepDefinition[]): void {
    this.steps = steps;
    if (this.activeStepIndex >= steps.length) {
      this.activeStepIndex = Math.max(0, steps.length - 1);
    }
  }

  onActiveStepChange(index: number): void {
    this.activeStepIndex = index;
  }

  onElementSelected(element: InspectedElement): void {
    this.stepBuilder?.applySelectedElement(element, this.activeStepIndex);
  }

  activeStepAction(): FlowStepDefinition['action'] | null {
    return this.steps[this.activeStepIndex]?.action ?? null;
  }
}
