import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AddSuggestionsResult,
  AnalyzerRunComparison,
  CollectionAnalyzerSettings,
  CollectionDetail,
  CollectionRun,
  DiscoverySuggestion,
  MonitorSelectedResponse,
  StartCollectionRunResponse,
  TestCollection,
} from '../models/collection.model';

export interface RunTestsSummary {
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    scenarioId: number;
    name: string;
    status: string;
    runId: number;
    error?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class CollectionService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/test-collections`;

  getCollections(): Observable<TestCollection[]> {
    return this.http.get<TestCollection[]>(this.apiBase);
  }

  getCollection(id: number): Observable<CollectionDetail> {
    return this.http.get<CollectionDetail>(`${this.apiBase}/${id}`);
  }

  createFromUrl(url: string): Observable<TestCollection> {
    return this.http.post<TestCollection>(`${this.apiBase}/from-url`, { url });
  }

  updateCollection(
    id: number,
    patch: { name?: string; description?: string }
  ): Observable<TestCollection> {
    return this.http.patch<TestCollection>(`${this.apiBase}/${id}`, patch);
  }

  deleteCollection(id: number, deleteTests = false): Observable<{ success: boolean }> {
    const params = new HttpParams().set('deleteTests', deleteTests ? 'true' : 'false');
    return this.http.delete<{ success: boolean }>(`${this.apiBase}/${id}`, { params });
  }

  runAllTests(id: number, options?: { recordVideo?: boolean }): Observable<RunTestsSummary> {
    return this.http.post<RunTestsSummary>(`${this.apiBase}/${id}/run-all`, options || {});
  }

  runSelectedTests(
    id: number,
    scenarioIds: number[],
    options?: { parallelism?: number }
  ): Observable<StartCollectionRunResponse> {
    return this.http.post<StartCollectionRunResponse>(`${this.apiBase}/${id}/run-selected`, {
      scenarioIds,
      parallelism: options?.parallelism ?? 2,
    });
  }

  getCollectionRuns(id: number, limit = 20): Observable<CollectionRun[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<CollectionRun[]>(`${this.apiBase}/${id}/runs`, { params });
  }

  getCollectionRun(runId: number): Observable<CollectionRun> {
    return this.http.get<CollectionRun>(`${this.apiBase}/runs/${runId}`);
  }

  cancelCollectionRun(runId: number): Observable<CollectionRun> {
    return this.http.post<CollectionRun>(`${this.apiBase}/runs/${runId}/cancel`, {});
  }

  deleteAllTests(id: number): Observable<{ success: boolean; deleted: number }> {
    return this.http.delete<{ success: boolean; deleted: number }>(`${this.apiBase}/${id}/tests`);
  }

  deleteSelectedTests(
    id: number,
    scenarioIds: number[]
  ): Observable<{ success: boolean; deleted: number }> {
    return this.http.request<{ success: boolean; deleted: number }>(
      'DELETE',
      `${this.apiBase}/${id}/tests/batch`,
      { body: { scenarioIds } }
    );
  }

  monitorSelectedTests(
    id: number,
    payload: {
      scenarioIds: number[];
      schedule?: string;
      alertEmail?: string;
      runNow?: boolean;
    }
  ): Observable<MonitorSelectedResponse> {
    return this.http.post<MonitorSelectedResponse>(`${this.apiBase}/${id}/monitor-selected`, payload);
  }

  tagSelectedTests(id: number, scenarioIds: number[], tag: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${this.apiBase}/${id}/tag-tests`, {
      scenarioIds,
      tag,
    });
  }

  getAnalyzerSettings(id: number): Observable<CollectionAnalyzerSettings> {
    return this.http.get<CollectionAnalyzerSettings>(`${this.apiBase}/${id}/analyzer-settings`);
  }

  saveAnalyzerSettings(id: number, settings: Partial<CollectionAnalyzerSettings>): Observable<CollectionAnalyzerSettings> {
    return this.http.patch<CollectionAnalyzerSettings>(`${this.apiBase}/${id}/analyzer-settings`, settings);
  }

  getAnalyzerComparison(id: number): Observable<AnalyzerRunComparison> {
    return this.http.get<AnalyzerRunComparison>(`${this.apiBase}/${id}/analyzer-comparison`);
  }

  addSuggestions(
    id: number,
    suggestions: DiscoverySuggestion[],
    replace = false
  ): Observable<AddSuggestionsResult> {
    return this.http.post<AddSuggestionsResult>(`${this.apiBase}/${id}/add-suggestions`, {
      suggestions,
      replace,
    });
  }
}
