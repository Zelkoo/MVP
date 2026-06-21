import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AnalyzerDepthPreset,
  AnalyzerJobResult,
  AnalyzerJobStartResponse,
  AnalyzerJobStatus,
} from '../models/collection.model';

export type AnalyzerDepth = 'quick' | 'standard' | 'deep';

@Injectable({ providedIn: 'root' })
export class AnalyzerService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/analyzer`;

  getDepthPresets(): Observable<Record<string, AnalyzerDepthPreset>> {
    return this.http.get<Record<string, AnalyzerDepthPreset>>(`${this.apiBase}/depth-presets`);
  }

  startJob(payload: {
    url: string;
    mode?: 'safe' | 'full';
    depth?: AnalyzerDepth;
    includeSubpages?: boolean;
    maxPages?: number;
    maxActionsPerPage?: number;
  }): Observable<AnalyzerJobStartResponse> {
    return this.http.post<AnalyzerJobStartResponse>(`${this.apiBase}/jobs`, payload);
  }

  getJob(id: number): Observable<AnalyzerJobStatus> {
    return this.http.get<AnalyzerJobStatus>(`${this.apiBase}/jobs/${id}`);
  }

  getJobResult(id: number): Observable<AnalyzerJobResult> {
    return this.http.get<AnalyzerJobResult>(`${this.apiBase}/jobs/${id}/result`);
  }

  cancelJob(id: number): Observable<AnalyzerJobStatus> {
    return this.http.post<AnalyzerJobStatus>(`${this.apiBase}/jobs/${id}/cancel`, {});
  }
}
