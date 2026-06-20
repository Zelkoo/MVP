import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Scan } from '../models/scan.model';
import { PublicReport } from '../models/public-report.model';

@Injectable({ providedIn: 'root' })
export class ScanService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = environment.apiUrl;

  createScan(url: string): Observable<Scan> {
    return this.http.post<Scan>(`${this.apiBase}/scans`, { url });
  }

  getScans(): Observable<Scan[]> {
    return this.http.get<Scan[]>(`${this.apiBase}/scans`);
  }

  getScan(id: number): Observable<Scan> {
    return this.http.get<Scan>(`${this.apiBase}/scans/${id}`);
  }

  getPublicReport(token: string): Observable<PublicReport> {
    return this.http.get<PublicReport>(`${this.apiBase}/reports/${token}`);
  }

  assetUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${environment.assetBase}${path}`;
  }

  screenshotUrl(path: string | null | undefined): string | null {
    return this.assetUrl(path);
  }

  publicReportUrl(token: string | null | undefined): string | null {
    if (!token || typeof window === 'undefined') return null;
    return `${window.location.origin}/report/${token}`;
  }
}
