import { Routes } from '@angular/router';
import { ScenariosComponent } from './pages/scenarios/scenarios.component';
import { ScenarioFormComponent } from './pages/scenario-form/scenario-form.component';
import { ScenarioDetailComponent } from './pages/scenario-detail/scenario-detail.component';
import { ScenarioRunComponent } from './pages/scenario-run/scenario-run.component';
import { HomeComponent } from './pages/home/home.component';
import { ScanHistoryComponent } from './pages/scan-history/scan-history.component';
import { ScanDetailComponent } from './pages/scan-detail/scan-detail.component';
import { ScanCompareComponent } from './pages/scan-compare/scan-compare.component';
import { PublicReportComponent } from './pages/public-report/public-report.component';

export const routes: Routes = [
  { path: '', component: ScenariosComponent },
  { path: 'scenarios/new', component: ScenarioFormComponent },
  { path: 'scenarios/:id', component: ScenarioDetailComponent },
  { path: 'scenario-runs/:id', component: ScenarioRunComponent },
  { path: 'site-scans', component: HomeComponent },
  { path: 'history', component: ScanHistoryComponent },
  { path: 'report/:token', component: PublicReportComponent },
  { path: 'scans/:id/compare/:previousId', component: ScanCompareComponent },
  { path: 'scans/:id', component: ScanDetailComponent },
  { path: '**', redirectTo: '' },
];
