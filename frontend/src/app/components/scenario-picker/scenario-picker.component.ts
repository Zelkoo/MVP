import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Scenario } from '../../models/scenario.model';
import { SafetyLevel } from '../../models/collection.model';
import {
  formatScenarioDisplayTitle,
  scenarioMatchesDomain,
  scenarioMatchesSearch,
  scenarioMatchesTypeFilter,
  scenarioPickerMetadata,
} from '../../utils/scenario-display.util';

@Component({
  selector: 'app-scenario-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scenario-picker.component.html',
  styleUrl: './scenario-picker.component.css',
})
export class ScenarioPickerComponent implements OnInit {
  @Input() scenarios: Scenario[] = [];
  @Input() selectedScenarioId: number | null = null;
  @Input() projectDomain: string | null = null;
  @Input() maxResults = 20;
  @Input() preferDomain = true;

  @Output() selectedScenarioIdChange = new EventEmitter<number | null>();

  searchQuery = '';
  typeFilter = '';
  domainFilter = '';

  ngOnInit(): void {
    if (this.preferDomain && this.projectDomain) {
      this.domainFilter = this.projectDomain;
    }
  }

  get selectedScenario(): Scenario | null {
    if (!this.selectedScenarioId) return null;
    return this.scenarios.find((scenario) => scenario.id === this.selectedScenarioId) || null;
  }

  get availableTypes(): string[] {
    const types = new Set<string>();
    for (const scenario of this.scenarios) {
      const meta = scenarioPickerMetadata(scenario);
      if (meta.type) types.add(meta.type.replace(/\s+/g, '-'));
    }
    return [...types].sort();
  }

  get filteredScenarios(): Scenario[] {
    return this.scenarios
      .filter((scenario) => scenarioMatchesSearch(scenario, this.searchQuery))
      .filter((scenario) => scenarioMatchesTypeFilter(scenario, this.typeFilter))
      .filter((scenario) => scenarioMatchesDomain(scenario, this.domainFilter || null))
      .slice(0, this.maxResults);
  }

  displayTitle(scenario: Scenario): string {
    return formatScenarioDisplayTitle(scenario);
  }

  metadataLine(scenario: Scenario): string {
    const meta = scenarioPickerMetadata(scenario);
    const parts = [
      meta.domain || 'unknown domain',
      meta.path,
      meta.type,
      meta.reliability !== '—' ? `reliability ${meta.reliability}` : null,
    ].filter(Boolean);
    return parts.join(' · ');
  }

  pickerMeta(scenario: Scenario) {
    return scenarioPickerMetadata(scenario);
  }

  safetyLabel(level: SafetyLevel | undefined): string {
    switch (level) {
      case 'safe-generated-element':
        return 'Safe (session)';
      case 'requires-confirmation':
        return 'Needs confirmation';
      case 'unsafe-skipped':
        return 'Skipped';
      default:
        return level ? 'Safe' : '';
    }
  }

  typeLabel(type: string): string {
    return type.replace(/-/g, ' ');
  }

  selectScenario(scenario: Scenario): void {
    if (!scenario.id) return;
    this.selectedScenarioIdChange.emit(scenario.id);
  }

  clearSelection(): void {
    this.selectedScenarioIdChange.emit(null);
  }
}
