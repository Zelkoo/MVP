import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IssueSeverity } from '../../models/scan.model';
import { DEFAULT_ISSUE_FILTERS, hasActiveFilters, IssueFilters } from '../../utils/issue-filter.util';
import { ISSUE_TYPE_OPTIONS } from '../../utils/issue-categories';

@Component({
  selector: 'app-issue-filters',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './issue-filters.component.html',
  styleUrl: './issue-filters.component.css',
})
export class IssueFiltersComponent {
  @Input({ required: true }) filters: IssueFilters = DEFAULT_ISSUE_FILTERS;
  @Input() totalCount = 0;
  @Input() filteredCount = 0;
  @Output() filtersChange = new EventEmitter<IssueFilters>();

  readonly typeOptions = ISSUE_TYPE_OPTIONS;
  readonly severities: Array<IssueSeverity | 'all'> = ['all', 'critical', 'warning', 'info'];

  severityLabel(value: IssueSeverity | 'all'): string {
    if (value === 'all') return 'All';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  isActive(): boolean {
    return hasActiveFilters(this.filters);
  }

  update(partial: Partial<IssueFilters>): void {
    this.filtersChange.emit({ ...this.filters, ...partial });
  }

  setSeverity(severity: IssueSeverity | 'all'): void {
    this.update({ severity });
  }

  clear(): void {
    this.filtersChange.emit({ ...DEFAULT_ISSUE_FILTERS });
  }
}
