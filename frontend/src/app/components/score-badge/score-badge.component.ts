import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { scoreClass, scoreLabel } from '../../utils/issue-categories';

@Component({
  selector: 'app-score-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './score-badge.component.html',
  styleUrl: './score-badge.component.css',
})
export class ScoreBadgeComponent {
  @Input({ required: true }) score!: number;

  label(): string {
    return scoreLabel(this.score);
  }

  cssClass(): string {
    return scoreClass(this.score);
  }

  ringOffset(): number {
    const circumference = 2 * Math.PI * 54;
    return circumference - (this.score / 100) * circumference;
  }
}
