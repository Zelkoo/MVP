import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { Scenario, SCENARIO_TYPE_OPTIONS } from '../../models/scenario.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';
import { formatScenarioDisplayTitle } from '../../utils/scenario-display.util';

@Component({
  selector: 'app-scenario-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingComponent, ErrorMessageComponent, TestReliabilityScoreComponent],
  templateUrl: './scenario-detail.component.html',
  styleUrl: './scenario-detail.component.css',
})
export class ScenarioDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly scenarioService = inject(ScenarioService);

  scenario: Scenario | null = null;
  loading = true;
  running = false;
  deleting = false;
  showDeleteModal = false;
  error: string | null = null;
  typeLabels = Object.fromEntries(SCENARIO_TYPE_OPTIONS.map((o) => [o.value, o.label]));

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error = 'Invalid scenario ID.';
      this.loading = false;
      return;
    }

    this.scenarioService.getScenario(id).subscribe({
      next: (scenario) => {
        this.scenario = scenario;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scenario.';
        this.loading = false;
      },
    });
  }

  displayTitle(): string {
    return this.scenario ? formatScenarioDisplayTitle(this.scenario) : 'Flow';
  }

  typeLabel(type: string): string {
    return this.typeLabels[type] || type;
  }

  flowSteps(): Array<Record<string, unknown>> {
    const steps = this.scenario?.config?.['steps'];
    return Array.isArray(steps) ? steps : [];
  }

  stepTitle(step: Record<string, unknown>): string {
    return String(step['label'] || step['action'] || 'Step');
  }

  stepSummary(step: Record<string, unknown>): string {
    switch (step['action']) {
      case 'goto':
        return String(step['url'] || this.scenario?.startUrl || '');
      case 'click':
        return String(step['selector'] || step['text'] || '');
      case 'fill':
        return `${step['selector']} → "${step['value'] || ''}"`;
      case 'waitForText':
        return String(step['text'] || '');
      case 'expectUrlContains':
        return String(step['value'] || '');
      case 'expectVisible':
        return String(step['selector'] || '');
      default:
        return String(step['action'] || '');
    }
  }

  run(): void {
    if (!this.scenario?.id || this.running) return;

    this.running = true;
    this.error = null;

    this.scenarioService.runScenario(this.scenario.id).subscribe({
      next: (run) => {
        this.running = false;
        if (run.id) {
          this.router.navigate(['/scenario-runs', run.id]);
        }
      },
      error: (err) => {
        this.running = false;
        if (err.error?.id) {
          this.router.navigate(['/scenario-runs', err.error.id]);
          return;
        }
        this.error = err.error?.error || 'Scenario run failed.';
      },
    });
  }

  openDeleteModal(): void {
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
  }

  confirmDelete(): void {
    if (!this.scenario?.id || this.deleting) return;

    this.deleting = true;
    this.scenarioService.deleteScenario(this.scenario.id).subscribe({
      next: () => {
        this.deleting = false;
        this.showDeleteModal = false;
        if (this.scenario?.collectionId) {
          this.router.navigate(['/collections', this.scenario.collectionId]);
          return;
        }
        this.router.navigate(['/flows']);
      },
      error: (err) => {
        this.deleting = false;
        this.error = err.error?.error || 'Failed to delete saved test.';
      },
    });
  }
}
