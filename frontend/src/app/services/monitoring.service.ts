import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  FlowRun,
  MonitoredFlow,
  MonitoringClientReport,
  MonitoringProject,
  MonitoringSchedule,
  ProjectDetail,
} from '../models/monitoring.model';
import { TestReliabilityResult } from '../models/test-reliability.model';

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  getProjects(): Observable<MonitoringProject[]> {
    return this.http.get<MonitoringProject[]>(`${this.apiBase}/projects`);
  }

  createProject(payload: { name: string; domain: string }): Observable<MonitoringProject> {
    return this.http.post<MonitoringProject>(`${this.apiBase}/projects`, payload);
  }

  getProject(id: number): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${this.apiBase}/projects/${id}`);
  }

  getClientReport(id: number, limit = 30): Observable<MonitoringClientReport> {
    return this.http.get<MonitoringClientReport>(`${this.apiBase}/projects/${id}/client-report`, {
      params: { limit: String(limit) },
    });
  }

  getFlow(id: number): Observable<MonitoredFlow> {
    return this.http.get<MonitoredFlow>(`${this.apiBase}/monitoring/flows/${id}`);
  }

  createFlow(payload: {
    projectId: number;
    name?: string;
    startUrl?: string;
    steps?: Record<string, unknown>[];
    successConditions?: Record<string, unknown>[];
    schedule?: MonitoringSchedule;
    isActive?: boolean;
    scenarioId?: number;
  }): Observable<MonitoredFlow> {
    return this.http.post<MonitoredFlow>(`${this.apiBase}/monitoring/flows`, payload);
  }

  updateFlow(
    id: number,
    patch: Partial<{
      name: string;
      startUrl: string;
      steps: Record<string, unknown>[];
      successConditions: Record<string, unknown>[];
      schedule: MonitoringSchedule;
      isActive: boolean;
      alertEmail: string | null;
      alertOnFailure: boolean;
      alertOnRecovery: boolean;
      failureThreshold: number;
    }>
  ): Observable<MonitoredFlow> {
    return this.http.patch<MonitoredFlow>(`${this.apiBase}/monitoring/flows/${id}`, patch);
  }

  runFlow(id: number): Observable<FlowRun & { stats: unknown; reliability: TestReliabilityResult }> {
    return this.http.post<FlowRun & { stats: unknown; reliability: TestReliabilityResult }>(
      `${this.apiBase}/monitoring/flows/${id}/run`,
      {}
    );
  }

  getFlowRuns(id: number, limit = 50): Observable<FlowRun[]> {
    return this.http.get<FlowRun[]>(`${this.apiBase}/monitoring/flows/${id}/runs`, {
      params: { limit: String(limit) },
    });
  }

  getFlowRun(id: number): Observable<FlowRun> {
    return this.http.get<FlowRun>(`${this.apiBase}/monitoring/flow-runs/${id}`);
  }

  screenshotUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.assetBase}${path}`;
  }
}
