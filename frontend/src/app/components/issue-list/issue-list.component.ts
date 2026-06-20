import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Issue } from '../../models/scan.model';
import { issueTrackId } from '../../utils/format.util';
import { typeLabel } from '../../utils/issue-categories';

@Component({
  selector: 'app-issue-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './issue-list.component.html',
  styleUrl: './issue-list.component.css',
})
export class IssueListComponent {
  @Input({ required: true }) issues: Issue[] = [];
  @Input() emptyMessage = 'No issues found.';

  severityClass(severity: string): string {
    return `severity-${severity}`;
  }

  typeLabel(type: string): string {
    return typeLabel(type);
  }

  trackIssue(index: number, issue: Issue): string | number {
    return issueTrackId(index, issue);
  }

  displayTitle(issue: Issue): string {
    if (issue.label && issue.label !== issue.message) {
      return `${issue.label}: ${issue.message}`;
    }
    return issue.label || issue.message;
  }

  affectedUrl(issue: Issue): string | null {
    if (issue.pageUrl) {
      return issue.pageUrl;
    }

    if (issue.source && /^https?:\/\//i.test(issue.source)) {
      return issue.source;
    }

    return null;
  }
}
