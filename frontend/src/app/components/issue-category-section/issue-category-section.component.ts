import { Component, Input } from '@angular/core';
import { Issue, IssueCategory } from '../../models/scan.model';
import { IssueListComponent } from '../issue-list/issue-list.component';

@Component({
  selector: 'app-issue-category-section',
  standalone: true,
  imports: [IssueListComponent],
  templateUrl: './issue-category-section.component.html',
  styleUrl: './issue-category-section.component.css',
})
export class IssueCategorySectionComponent {
  @Input({ required: true }) category!: IssueCategory;
  @Input({ required: true }) issues: Issue[] = [];
}
