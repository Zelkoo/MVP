import { Issue, IssueSeverity, IssueType } from '../models/scan.model';
import { issueBelongsToCategory, ISSUE_CATEGORIES } from './issue-categories';

export interface IssueFilters {
  severity: IssueSeverity | 'all';
  type: IssueType | 'all';
  search: string;
}

export const DEFAULT_ISSUE_FILTERS: IssueFilters = {
  severity: 'all',
  type: 'all',
  search: '',
};

export function filterIssues(issues: Issue[], filters: IssueFilters): Issue[] {
  const query = filters.search.trim().toLowerCase();

  return issues.filter((issue) => {
    if (filters.severity !== 'all' && issue.severity !== filters.severity) {
      return false;
    }

    if (filters.type !== 'all' && issue.type !== filters.type) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      issue.label,
      issue.message,
      issue.description,
      issue.details,
      issue.source,
      issue.recommendation,
      issue.pageUrl,
      issue.type,
      issue.severity,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function filteredIssuesForCategory(
  issues: Issue[],
  filters: IssueFilters,
  categoryId: string
): Issue[] {
  const category = ISSUE_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) return [];

  const filtered = filterIssues(issues, filters);
  return filtered.filter((issue) => issueBelongsToCategory(issue, category));
}

export function hasActiveFilters(filters: IssueFilters): boolean {
  return (
    filters.severity !== 'all' ||
    filters.type !== 'all' ||
    filters.search.trim().length > 0
  );
}
