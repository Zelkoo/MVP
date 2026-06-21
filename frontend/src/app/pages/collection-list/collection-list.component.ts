import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CollectionService } from '../../services/collection.service';
import { TestCollection } from '../../models/collection.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { formatScanDate } from '../../utils/format.util';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, RouterLink, LoadingComponent, ErrorMessageComponent],
  templateUrl: './collection-list.component.html',
  styleUrl: './collection-list.component.css',
})
export class CollectionListComponent implements OnInit {
  private readonly collectionService = inject(CollectionService);

  collections: TestCollection[] = [];
  loading = true;
  error: string | null = null;
  deletingId: number | null = null;
  deleteError: string | null = null;

  ngOnInit(): void {
    this.loadCollections();
  }

  loadCollections(): void {
    this.loading = true;
    this.error = null;
    this.collectionService.getCollections().subscribe({
      next: (collections) => {
        this.collections = collections;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load collections.';
        this.loading = false;
      },
    });
  }

  formatDate(value: string | undefined | null): string {
    return formatScanDate(value);
  }

  statusLabel(status: string | null | undefined): string {
    if (!status) return 'Not run yet';
    if (status === 'passed') return 'Last run passed';
    if (status === 'failed') return 'Last run failed';
    if (status === 'partial') return 'Last run partial';
    return 'Last run had errors';
  }

  statusClass(status: string | null | undefined): string {
    return status ? `status-${status}` : 'status-unknown';
  }

  confirmDelete(collection: TestCollection, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const hideTests = window.confirm(
      `Delete "${collection.name}" and hide all generated tests?\n\nMonitoring flows will not be deleted.`
    );
    if (!hideTests) return;

    this.deletingId = collection.id;
    this.deleteError = null;
    this.collectionService.deleteCollection(collection.id, true).subscribe({
      next: () => {
        this.deletingId = null;
        this.loadCollections();
      },
      error: (err) => {
        this.deletingId = null;
        this.deleteError = err.error?.error || 'Failed to delete collection.';
      },
    });
  }
}
