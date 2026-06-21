import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Scenario, ScenarioRun } from '../models/scenario.model';
import { TestReliabilityResult } from '../models/test-reliability.model';

@Injectable({ providedIn: 'root' })
export class ScenarioService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  getScenarios(): Observable<Scenario[]> {
    return this.http.get<Scenario[]>(`${this.apiBase}/scenarios`);
  }

  getScenario(id: number): Observable<Scenario> {
    return this.http.get<Scenario>(`${this.apiBase}/scenarios/${id}`);
  }

  createScenario(payload: Partial<Scenario>): Observable<Scenario> {
    return this.http.post<Scenario>(`${this.apiBase}/scenarios`, payload);
  }

  runScenario(id: number, options?: { recordVideo?: boolean }): Observable<ScenarioRun> {
    return this.http.post<ScenarioRun>(`${this.apiBase}/scenarios/${id}/run`, options || {});
  }

  getScenarioRun(id: number): Observable<ScenarioRun> {
    return this.http.get<ScenarioRun>(`${this.apiBase}/scenario-runs/${id}`);
  }

  scoreReliability(payload: {
    type?: string;
    startUrl?: string;
    config?: Record<string, unknown>;
    steps?: Record<string, unknown>[] | null;
  }): Observable<TestReliabilityResult> {
    return this.http.post<TestReliabilityResult>(`${this.apiBase}/scenarios/reliability-score`, payload);
  }

  deleteScenario(id: number): Observable<{ success: boolean; deleted?: boolean; warning?: string }> {
    return this.http.delete<{ success: boolean; deleted?: boolean; warning?: string }>(
      `${this.apiBase}/scenarios/${id}`
    );
  }

  screenshotUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.assetBase}${path}`;
  }

  videoUrl(path: string | null | undefined): string | null {
    return this.screenshotUrl(path);
  }
}
