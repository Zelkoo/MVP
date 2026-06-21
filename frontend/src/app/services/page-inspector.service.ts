import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { InspectPageRequest, PageInspectionResult } from '../models/page-inspector.model';

@Injectable({ providedIn: 'root' })
export class PageInspectorService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  inspectPage(payload: InspectPageRequest): Observable<PageInspectionResult> {
    return this.http.post<PageInspectionResult>(`${this.apiBase}/page-inspector/inspect`, payload);
  }

  isPageInspectorAvailable(): Observable<boolean> {
    return this.http.get<{ features?: string[] }>(`${this.apiBase}/health`).pipe(
      map((body) => body.features?.includes('page-inspector') ?? false),
      catchError(() => of(false))
    );
  }

  screenshotUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.assetBase}${path}`;
  }
}
