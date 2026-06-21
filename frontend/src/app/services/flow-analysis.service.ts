import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DryRunAnalysisResult, DryRunAnalyzeRequest } from '../utils/success-condition.util';

@Injectable({ providedIn: 'root' })
export class FlowAnalysisService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  analyzeSuccessConditions(payload: DryRunAnalyzeRequest): Observable<DryRunAnalysisResult> {
    return this.http.post<DryRunAnalysisResult>(`${this.apiBase}/flows/dry-run-analyze`, payload);
  }

  screenshotUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.assetBase}${path}`;
  }
}
