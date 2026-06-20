import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ScenarioService } from '../../services/scenario.service';
import { Scenario, SCENARIO_TYPE_OPTIONS } from '../../models/scenario.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-scenarios',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingComponent, ErrorMessageComponent],
  templateUrl: './scenarios.component.html',
  styleUrl: './scenarios.component.css',
})
export class ScenariosComponent implements OnInit {
  private readonly scenarioService = inject(ScenarioService);

  scenarios: Scenario[] = [];
  loading = true;
  error: string | null = null;
  typeLabels = Object.fromEntries(SCENARIO_TYPE_OPTIONS.map((o) => [o.value, o.label]));

  ngOnInit(): void {
    this.scenarioService.getScenarios().subscribe({
      next: (scenarios) => {
        this.scenarios = scenarios;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load scenarios.';
        this.loading = false;
      },
    });
  }

  typeLabel(type: string): string {
    return this.typeLabels[type] || type;
  }

  stepCount(scenario: Scenario): number {
    const steps = scenario.config?.['steps'];
    return Array.isArray(steps) ? steps.length : 0;
  }

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }
}
