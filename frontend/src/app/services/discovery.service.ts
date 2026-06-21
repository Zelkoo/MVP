import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DiscoveryJobResult,
  DiscoveryJobStartResponse,
  DiscoveryJobStatus,
  DiscoveryResult,
  DiscoverySaveResult,
} from '../models/collection.model';

@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/test-discovery`;

  startJob(payload: {
    url: string;
    maxPages?: number;
    maxActions?: number;
    maxDepth?: number;
    includeSubpages?: boolean;
    mode?: 'safe' | 'full';
  }): Observable<DiscoveryJobStartResponse> {
    return this.http.post<DiscoveryJobStartResponse>(`${this.apiBase}/jobs`, payload);
  }

  getJob(id: number): Observable<DiscoveryJobStatus> {
    return this.http.get<DiscoveryJobStatus>(`${this.apiBase}/jobs/${id}`);
  }

  getJobResult(id: number): Observable<DiscoveryJobResult> {
    return this.http.get<DiscoveryJobResult>(`${this.apiBase}/jobs/${id}/result`);
  }

  cancelJob(id: number): Observable<DiscoveryJobStatus> {
    return this.http.post<DiscoveryJobStatus>(`${this.apiBase}/jobs/${id}/cancel`, {});
  }

  discover(payload: {
    url: string;
    maxActions?: number;
    maxDepth?: number;
    maxPages?: number;
    includeSubpages?: boolean;
    mode?: 'safe' | 'full';
  }): Observable<DiscoveryResult> {
    return this.http.post<DiscoveryResult>(`${this.apiBase}/discover`, payload);
  }

  analyze(payload: {
    url: string;
    maxPages?: number;
    mode?: 'safe' | 'full';
  }): Observable<DiscoveryResult> {
    return this.http.post<DiscoveryResult>(`${this.apiBase}/analyze`, payload);
  }

  analyzeAndSave(payload: {
    url: string;
    maxPages?: number;
    maxActions?: number;
    mode?: 'safe' | 'full';
    saveSafeOnly?: boolean;
  }): Observable<DiscoverySaveResult> {
    return this.http.post<DiscoverySaveResult>(`${this.apiBase}/analyze-and-save`, payload);
  }
}
