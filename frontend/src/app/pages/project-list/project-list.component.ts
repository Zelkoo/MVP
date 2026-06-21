import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MonitoringService } from '../../services/monitoring.service';
import { MonitoringProject } from '../../models/monitoring.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LoadingComponent, ErrorMessageComponent],
  templateUrl: './project-list.component.html',
  styleUrl: './project-list.component.css',
})
export class ProjectListComponent implements OnInit {
  private readonly monitoringService = inject(MonitoringService);

  projects: MonitoringProject[] = [];
  loading = true;
  error: string | null = null;
  creating = false;
  showForm = false;
  formError: string | null = null;
  form = { name: '', domain: '' };

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.loading = true;
    this.error = null;
    this.monitoringService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load projects.';
        this.loading = false;
      },
    });
  }

  createProject(): void {
    this.formError = null;
    if (!this.form.name.trim() || !this.form.domain.trim()) {
      this.formError = 'Name and domain are required.';
      return;
    }

    this.creating = true;
    this.monitoringService
      .createProject({ name: this.form.name.trim(), domain: this.form.domain.trim() })
      .subscribe({
        next: () => {
          this.form = { name: '', domain: '' };
          this.showForm = false;
          this.creating = false;
          this.loadProjects();
        },
        error: (err) => {
          this.formError = err.error?.error || 'Failed to create project.';
          this.creating = false;
        },
      });
  }

  formatDate(value: string | undefined): string {
    return formatScanDate(value);
  }

  passRateLabel(rate: number | null | undefined): string {
    if (rate == null) return '—';
    return `${rate}%`;
  }
}
