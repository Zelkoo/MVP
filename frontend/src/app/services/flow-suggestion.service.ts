import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AnalyzeFlowRequest, FlowAnalysisResult } from '../models/flow-suggestion.model';

@Injectable({ providedIn: 'root' })
export class FlowSuggestionService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  analyzePage(payload: AnalyzeFlowRequest): Observable<FlowAnalysisResult> {
    return this.http.post<FlowAnalysisResult>(`${this.apiBase}/flow-suggestions/analyze`, payload);
  }

  screenshotUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.assetBase}${path}`;
  }
}
