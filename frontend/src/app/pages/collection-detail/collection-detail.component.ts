import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, switchMap, takeWhile, timer } from 'rxjs';
import { CollectionService } from '../../services/collection.service';
import { DiscoveryService } from '../../services/discovery.service';
import { ScenarioService } from '../../services/scenario.service';
import {
  AnalyzerRunComparison,
  CollectionAnalyzerSettings,
  CollectionDetail,
  CollectionRun,
  CollectionScenario,
  MonitorSelectedResponse,
  SafetyLevel,
} from '../../models/collection.model';
import { LoadingComponent } from '../../components/loading/loading.component';
import { ErrorMessageComponent } from '../../components/error-message/error-message.component';
import { formatScanDate } from '../../utils/format.util';
import { formatScenarioDisplayTitle } from '../../utils/scenario-display.util';

type DetailTab = 'tests' | 'runs' | 'monitoring' | 'settings' | 'history';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    LoadingComponent,
    ErrorMessageComponent,
  ],
  templateUrl: './collection-detail.component.html',
  styleUrl: './collection-detail.component.css',
})
export class CollectionDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collectionService = inject(CollectionService);
  private readonly discoveryService = inject(DiscoveryService);
  private readonly scenarioService = inject(ScenarioService);

  collection: CollectionDetail | null = null;
  loading = true;
  error: string | null = null;
  activeTab: DetailTab = 'tests';
  showDeleteModal = false;
  deleteTestsWithCollection = true;
  deleting = false;
  analyzing = false;
  analyzeMessage: string | null = null;
  settingsName = '';
  settingsDescription = '';
  savingSettings = false;
  runningTestId: number | null = null;
  runningAll = false;
  runningSelected = false;
  cancellingRun = false;
  deletingSelected = false;
  showDeleteSelectedModal = false;
  monitoringSelected = false;
  taggingSelected = false;
  activeCollectionRun: CollectionRun | null = null;
  collectionRuns: CollectionRun[] = [];
  loadingCollectionRuns = false;
  private runPollSub: Subscription | null = null;
  runAllSummary: {
    total: number;
    passed: number;
    failed: number;
    results: Array<{ scenarioId: number; name: string; status: string; runId: number; error?: string }>;
  } | null = null;
  deletingTestId: number | null = null;
  deletingAllTests = false;
  showDevDetails = false;

  selectedTestIds = new Set<number>();
  filterPage = '';
  filterType = '';
  filterSafety = '';
  filterLastStatus = '';
  filterMonitored = '';
  filterReliabilityMin = 0;
  tagInput = '';

  analyzerSettings: CollectionAnalyzerSettings = {
    importantKeywords: [],
    ignoredPaths: [],
    allowedRiskLevel: 'safe',
    preferredTestTypes: [],
    maxPagesDefault: 10,
    maxActionsDefault: 25,
    alertEmail: '',
  };
  settingsKeywordsText = '';
  settingsIgnoredPathsText = '';
  settingsPreferredTypesText = '';
  savingAnalyzerSettings = false;

  showMonitorModal = false;
  showMonitorSuccess = false;
  monitorSuccess: MonitorSelectedResponse | null = null;
  monitorSchedule: 'daily' | 'weekly' | 'every-6-hours' | 'manual' = 'daily';
  monitorRunNow = true;
  monitorAlertEmail = '';

  analyzerComparison: AnalyzerRunComparison | null = null;
  loadingComparison = false;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (!id) {
        this.error = 'Invalid collection.';
        this.loading = false;
        return;
      }
      this.loadCollection(id);
    });
  }

  ngOnDestroy(): void {
    this.stopRunPolling();
  }

  loadCollection(id: number): void {
    this.loading = true;
    this.error = null;
    this.collectionService.getCollection(id).subscribe({
      next: (detail) => {
        this.collection = detail;
        this.settingsName = detail.name;
        this.settingsDescription = detail.description || '';
        this.analyzerSettings = {
          importantKeywords: [],
          ignoredPaths: [],
          allowedRiskLevel: 'safe',
          preferredTestTypes: [],
          maxPagesDefault: 10,
          maxActionsDefault: 25,
          alertEmail: '',
          ...(detail.analyzerSettings || {}),
        };
        this.settingsKeywordsText = (this.analyzerSettings.importantKeywords || []).join(', ');
        this.settingsIgnoredPathsText = (this.analyzerSettings.ignoredPaths || []).join('\n');
        this.settingsPreferredTypesText = (this.analyzerSettings.preferredTestTypes || []).join(', ');
        this.monitorAlertEmail = this.analyzerSettings.alertEmail || '';
        this.selectedTestIds.clear();
        this.loading = false;
        this.loadAnalyzerComparison(id);
        this.loadCollectionRuns(id);
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load collection.';
        this.loading = false;
      },
    });
  }

  loadAnalyzerComparison(id: number): void {
    if ((this.collection?.analyzerHistory?.length || 0) < 2) {
      this.analyzerComparison = null;
      return;
    }
    this.loadingComparison = true;
    this.collectionService.getAnalyzerComparison(id).subscribe({
      next: (comparison) => {
        this.analyzerComparison = comparison;
        this.loadingComparison = false;
      },
      error: () => {
        this.analyzerComparison = null;
        this.loadingComparison = false;
      },
    });
  }

  formatDate(value: string | undefined | null): string {
    return formatScanDate(value);
  }

  loadCollectionRuns(id: number): void {
    this.loadingCollectionRuns = true;
    this.collectionService.getCollectionRuns(id).subscribe({
      next: (runs) => {
        this.collectionRuns = runs;
        this.loadingCollectionRuns = false;
      },
      error: () => {
        this.collectionRuns = [];
        this.loadingCollectionRuns = false;
      },
    });
  }

  formatElapsed(ms: number | undefined | null): string {
    if (!ms || ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  passRateForRun(run: CollectionRun | null | undefined): number | null {
    if (!run || !run.totalTests) return null;
    const completed = run.totalTests - (run.skippedCount || 0);
    if (completed <= 0) return null;
    if (run.result?.passRate != null) return run.result.passRate;
    return Math.round(((run.passedCount || 0) / completed) * 100);
  }

  isRunActive(run: CollectionRun | null | undefined): boolean {
    return !!run && (run.status === 'queued' || run.status === 'running');
  }

  stopRunPolling(): void {
    if (this.runPollSub) {
      this.runPollSub.unsubscribe();
      this.runPollSub = null;
    }
  }

  pollCollectionRun(runId: number): void {
    this.stopRunPolling();
    this.runningSelected = true;
    this.runAllSummary = null;

    this.runPollSub = timer(0, 1500)
      .pipe(
        switchMap(() => this.collectionService.getCollectionRun(runId)),
        takeWhile((run) => run.status === 'queued' || run.status === 'running', true)
      )
      .subscribe({
        next: (run) => {
          this.activeCollectionRun = run;
          if (!this.isRunActive(run)) {
            this.runningSelected = false;
            this.stopRunPolling();
            if (this.collection) {
              this.loadCollection(this.collection.id);
              this.loadCollectionRuns(this.collection.id);
            }
          }
        },
        error: (err) => {
          this.runningSelected = false;
          this.stopRunPolling();
          this.error = err.error?.error || 'Failed to load collection run progress.';
        },
      });
  }

  cancelActiveRun(): void {
    if (!this.activeCollectionRun || this.cancellingRun) return;

    this.cancellingRun = true;
    this.collectionService.cancelCollectionRun(this.activeCollectionRun.id).subscribe({
      next: (run) => {
        this.cancellingRun = false;
        this.activeCollectionRun = run;
      },
      error: (err) => {
        this.cancellingRun = false;
        this.error = err.error?.error || 'Failed to cancel run.';
      },
    });
  }

  completedRunItems(run: CollectionRun | null | undefined): CollectionRun['items'] {
    return (run?.items || []).filter(
      (item) => item.status !== 'queued' && item.status !== 'running'
    );
  }

  suiteStatPassRate(): number | null {
    return this.collection?.suiteStats?.lastPassRate ?? this.passRateForRun(this.collection?.suiteStats?.lastCollectionRun);
  }

  categoryLabel(test: CollectionScenario): string {
    const meta = test.metadata;
    if (meta?.category) return meta.category.replace(/-/g, ' ');
    if (meta?.patternType) return meta.patternType.replace(/-/g, ' ');
    return test.type.replace(/-/g, ' ');
  }

  safetyLabel(level: SafetyLevel | undefined): string {
    switch (level) {
      case 'safe':
        return 'Safe';
      case 'safe-generated-element':
        return 'Safe (session element)';
      case 'requires-confirmation':
        return 'Needs confirmation';
      case 'unsafe-skipped':
        return 'Skipped (risky)';
      default:
        return 'Safe';
    }
  }

  safetyClass(level: SafetyLevel | undefined): string {
    return `safety-${level || 'safe'}`;
  }

  confidenceText(test: CollectionScenario): string {
    const confidence = test.metadata?.confidence;
    if (confidence == null) return '—';
    return `${Math.round(confidence * 100)}%`;
  }

  runStatusLabel(status: string | null | undefined): string {
    if (!status) return 'Not run yet';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  runStatusClass(status: string | null | undefined): string {
    return status ? `status-${status}` : 'status-unknown';
  }

  sourcePath(test: CollectionScenario): string {
    if (!this.collection) return '/';
    try {
      const url = new URL(test.sourceUrl || test.startUrl);
      return url.pathname || '/';
    } catch {
      return test.sourceUrl || test.startUrl;
    }
  }

  testTags(test: CollectionScenario): string[] {
    if (!this.collection?.testTags || !test.id) return [];
    return this.collection.testTags[String(test.id)] || [];
  }

  isMonitored(test: CollectionScenario): boolean {
    return !!this.monitoredTestInfo(test);
  }

  monitoredTestInfo(test: CollectionScenario): { flowId: number; schedule: string; isActive?: boolean } | null {
    if (!test.id || !this.collection?.monitoredTests) return null;
    return this.collection.monitoredTests[String(test.id)] || null;
  }

  monitorStatusLabel(test: CollectionScenario): string {
    const info = this.monitoredTestInfo(test);
    if (!info) return 'Not monitored';
    switch (info.schedule) {
      case 'daily':
        return 'Monitored daily';
      case 'weekly':
        return 'Monitored weekly';
      case 'every-6-hours':
        return 'Monitored every 6 hours';
      case 'manual':
        return 'Monitored (manual)';
      default:
        return 'Monitored';
    }
  }

  monitorBadgeClass(test: CollectionScenario): string {
    return this.isMonitored(test) ? 'monitor-badge-active' : 'monitor-badge-none';
  }

  scheduleLabel(schedule?: string): string {
    switch (schedule) {
      case 'daily':
        return 'daily';
      case 'weekly':
        return 'weekly';
      case 'every-6-hours':
        return 'every 6 hours';
      case 'manual':
        return 'on demand';
      default:
        return 'daily';
    }
  }

  monitorProjectName(): string {
    if (this.collection?.monitoringProject?.name) {
      return this.collection.monitoringProject.name;
    }
    if (!this.collection) return '';
    return `${this.collection.domain} monitoring`;
  }

  selectedAlreadyMonitoredCount(): number {
    return this.selectedScenarioIds().filter((id) =>
      this.collection?.monitoredScenarioIds?.includes(id)
    ).length;
  }

  monitorSuccessMessage(): string {
    if (!this.monitorSuccess) return '';
    const { created, alreadyMonitored, schedule } = this.monitorSuccess;
    if (created === 0) {
      if (alreadyMonitored > 0) {
        return `${alreadyMonitored} selected test${alreadyMonitored === 1 ? '' : 's'} ${alreadyMonitored === 1 ? 'is' : 'are'} already monitored.`;
      }
      return 'No tests were added to monitoring.';
    }
    let message = `${created} test${created === 1 ? '' : 's'} ${created === 1 ? 'is' : 'are'} now monitored ${this.scheduleLabel(schedule)}.`;
    if (alreadyMonitored > 0) {
      message += ` ${alreadyMonitored} ${alreadyMonitored === 1 ? 'was' : 'were'} already monitored and skipped.`;
    }
    return message;
  }

  openMonitoringDashboard(): void {
    if (!this.monitorSuccess?.projectId) return;
    this.router.navigate(['/projects', this.monitorSuccess.projectId]);
  }

  dismissMonitorSuccess(): void {
    this.showMonitorSuccess = false;
    this.monitorSuccess = null;
  }

  get filteredTests(): CollectionScenario[] {
    if (!this.collection) return [];
    return this.collection.scenarios.filter((test) => {
      if (this.filterPage && this.sourcePath(test) !== this.filterPage) return false;
      if (this.filterType && this.categoryLabel(test) !== this.filterType && test.type !== this.filterType) {
        const pattern = test.metadata?.patternType || '';
        if (pattern !== this.filterType) return false;
      }
      if (this.filterSafety && (test.metadata?.safetyLevel || 'safe') !== this.filterSafety) return false;
      if (this.filterLastStatus) {
        const status = test.lastRunStatus || 'none';
        if (status !== this.filterLastStatus) return false;
      }
      if (this.filterMonitored === 'monitored' && !this.isMonitored(test)) return false;
      if (this.filterMonitored === 'not-monitored' && this.isMonitored(test)) return false;
      const confidence = test.metadata?.confidence || 0;
      if (this.filterReliabilityMin > 0 && confidence * 100 < this.filterReliabilityMin) return false;
      return true;
    });
  }

  get filteredGroupedTests(): Array<{ path: string; tests: CollectionScenario[] }> {
    const groups = new Map<string, CollectionScenario[]>();
    for (const test of this.filteredTests) {
      const path = this.sourcePath(test);
      if (!groups.has(path)) groups.set(path, []);
      groups.get(path)!.push(test);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, tests]) => ({ path, tests }));
  }

  get availablePages(): string[] {
    if (!this.collection) return [];
    return [...new Set(this.collection.scenarios.map((test) => this.sourcePath(test)))].sort();
  }

  get availableTypes(): string[] {
    if (!this.collection) return [];
    return [
      ...new Set(
        this.collection.scenarios.map(
          (test) => test.metadata?.patternType || test.metadata?.category || test.type
        )
      ),
    ].sort();
  }

  toggleTestSelection(test: CollectionScenario, checked: boolean): void {
    if (!test.id) return;
    if (checked) this.selectedTestIds.add(test.id);
    else this.selectedTestIds.delete(test.id);
  }

  isTestSelected(test: CollectionScenario): boolean {
    return test.id ? this.selectedTestIds.has(test.id) : false;
  }

  toggleSelectAllFiltered(checked: boolean): void {
    for (const test of this.filteredTests) {
      if (!test.id) continue;
      if (checked) this.selectedTestIds.add(test.id);
      else this.selectedTestIds.delete(test.id);
    }
  }

  allFilteredSelected(): boolean {
    const ids = this.filteredTests.map((test) => test.id).filter(Boolean) as number[];
    return ids.length > 0 && ids.every((id) => this.selectedTestIds.has(id));
  }

  selectedScenarioIds(): number[] {
    return [...this.selectedTestIds];
  }

  analyzeAgain(): void {
    if (!this.collection || this.analyzing) return;

    this.analyzing = true;
    this.analyzeMessage = null;
    this.error = null;

    this.discoveryService
      .analyzeAndSave({
        url: this.collection.startUrl,
        maxPages: this.analyzerSettings.maxPagesDefault || 10,
        maxActions: this.analyzerSettings.maxActionsDefault || 25,
        mode: this.analyzerSettings.allowedRiskLevel === 'full' ? 'full' : 'safe',
        saveSafeOnly: true,
      })
      .subscribe({
        next: (result) => {
          this.analyzing = false;
          this.analyzeMessage = result.saveResult.message;
          this.loadCollection(this.collection!.id);
        },
        error: (err) => {
          this.analyzing = false;
          this.error = err.error?.error || 'Discovery failed.';
        },
      });
  }

  discoverMore(): void {
    if (!this.collection) return;
    this.router.navigate(['/'], {
      queryParams: { url: this.collection.startUrl, mode: 'discover' },
    });
  }

  runTest(test: CollectionScenario, stayOnPage = false): void {
    if (!test.id || this.runningTestId || this.runningAll || this.runningSelected) return;

    this.runningTestId = test.id;
    this.scenarioService.runScenario(test.id, { recordVideo: true }).subscribe({
      next: (run) => {
        this.runningTestId = null;
        if (!stayOnPage && run.id) {
          this.router.navigate(['/scenario-runs', run.id]);
          return;
        }
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.runningTestId = null;
        if (!stayOnPage && err.error?.id) {
          this.router.navigate(['/scenario-runs', err.error.id]);
          return;
        }
        this.error = err.error?.error || 'Failed to run test.';
        this.loadCollection(this.collection!.id);
      },
    });
  }

  runAllTests(): void {
    if (!this.collection || this.runningAll || this.runningTestId) return;
    if (this.collection.scenarios.length === 0) return;

    const confirmed = window.confirm(
      `Run all ${this.collection.scenarios.length} tests in this collection? This may take several minutes.`
    );
    if (!confirmed) return;

    this.runningAll = true;
    this.runAllSummary = null;
    this.error = null;

    this.collectionService.runAllTests(this.collection.id).subscribe({
      next: (summary) => {
        this.runningAll = false;
        this.runAllSummary = summary;
        this.activeTab = 'runs';
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.runningAll = false;
        this.error = err.error?.error || 'Failed to run collection tests.';
      },
    });
  }

  runSelectedTests(): void {
    const ids = this.selectedScenarioIds();
    if (!this.collection || ids.length === 0 || this.runningSelected) return;

    this.runningSelected = true;
    this.runAllSummary = null;
    this.activeCollectionRun = null;
    this.error = null;

    this.collectionService.runSelectedTests(this.collection.id, ids).subscribe({
      next: (response) => {
        this.activeCollectionRun = response.run;
        this.activeTab = 'runs';
        this.pollCollectionRun(response.runId);
      },
      error: (err) => {
        this.runningSelected = false;
        this.error = err.error?.error || 'Failed to run selected tests.';
      },
    });
  }

  runGroupTests(tests: CollectionScenario[]): void {
    if (!this.collection || this.runningAll || this.runningTestId || tests.length === 0) return;
    const ids = tests.map((test) => test.id).filter(Boolean) as number[];
    if (ids.length === 0) return;

    this.selectedTestIds = new Set(ids);
    this.runSelectedTests();
  }

  displayTitle(test: CollectionScenario): string {
    return formatScenarioDisplayTitle(test);
  }

  deleteTest(test: CollectionScenario): void {
    if (!test.id || this.deletingTestId || this.deletingAllTests) return;

    const confirmed = window.confirm(
      `Remove "${this.displayTitle(test)}" from this collection?\n\nRun history will be kept. The test will no longer appear in saved tests.`
    );
    if (!confirmed) return;

    this.deletingTestId = test.id;
    this.scenarioService.deleteScenario(test.id).subscribe({
      next: (result) => {
        this.deletingTestId = null;
        this.analyzeMessage = result.warning
          ? `Test removed. ${result.warning}`
          : 'Test removed from collection. Run history was kept.';
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.deletingTestId = null;
        this.error = err.error?.error || 'Failed to remove test.';
      },
    });
  }

  openDeleteSelectedModal(): void {
    if (this.selectedScenarioIds().length === 0) return;
    this.showDeleteSelectedModal = true;
  }

  closeDeleteSelectedModal(): void {
    this.showDeleteSelectedModal = false;
  }

  confirmDeleteSelectedTests(): void {
    const ids = this.selectedScenarioIds();
    if (!this.collection || ids.length === 0 || this.deletingSelected) return;

    this.deletingSelected = true;
    this.collectionService.deleteSelectedTests(this.collection.id, ids).subscribe({
      next: () => {
        this.deletingSelected = false;
        this.showDeleteSelectedModal = false;
        this.selectedTestIds.clear();
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.deletingSelected = false;
        this.error = err.error?.error || 'Failed to remove selected tests.';
      },
    });
  }

  deleteSelectedTests(): void {
    this.openDeleteSelectedModal();
  }

  deleteAllTests(): void {
    if (!this.collection || this.deletingAllTests || this.collection.scenarios.length === 0) return;

    const confirmed = window.confirm(
      `Remove all ${this.collection.scenarios.length} saved tests from this collection?\n\nThe collection itself will remain.`
    );
    if (!confirmed) return;

    this.deletingAllTests = true;
    this.error = null;

    this.collectionService.deleteAllTests(this.collection.id).subscribe({
      next: () => {
        this.deletingAllTests = false;
        this.runAllSummary = null;
        this.selectedTestIds.clear();
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.deletingAllTests = false;
        this.error = err.error?.error || 'Failed to remove tests.';
      },
    });
  }

  openMonitorModal(): void {
    if (this.selectedScenarioIds().length === 0) return;
    this.monitorRunNow = true;
    this.showMonitorSuccess = false;
    this.showMonitorModal = true;
  }

  closeMonitorModal(): void {
    this.showMonitorModal = false;
  }

  confirmMonitorSelected(): void {
    const ids = this.selectedScenarioIds();
    if (!this.collection || ids.length === 0 || this.monitoringSelected) return;

    this.monitoringSelected = true;
    this.collectionService
      .monitorSelectedTests(this.collection.id, {
        scenarioIds: ids,
        schedule: this.monitorSchedule,
        alertEmail: this.monitorAlertEmail.trim(),
        runNow: this.monitorRunNow,
      })
      .subscribe({
        next: (result) => {
          this.monitoringSelected = false;
          this.showMonitorModal = false;
          this.monitorSuccess = result;
          this.showMonitorSuccess = true;
          this.selectedTestIds.clear();
          this.loadCollection(this.collection!.id);
        },
        error: (err) => {
          this.monitoringSelected = false;
          this.error = err.error?.error || 'Failed to create monitoring flows.';
        },
      });
  }

  tagSelectedTests(): void {
    const ids = this.selectedScenarioIds();
    const tag = this.tagInput.trim();
    if (!this.collection || ids.length === 0 || !tag || this.taggingSelected) return;

    this.taggingSelected = true;
    this.collectionService.tagSelectedTests(this.collection.id, ids, tag).subscribe({
      next: () => {
        this.taggingSelected = false;
        this.tagInput = '';
        this.loadCollection(this.collection!.id);
      },
      error: (err) => {
        this.taggingSelected = false;
        this.error = err.error?.error || 'Failed to tag tests.';
      },
    });
  }

  saveSettings(): void {
    if (!this.collection || this.savingSettings) return;

    this.savingSettings = true;
    this.collectionService
      .updateCollection(this.collection.id, {
        name: this.settingsName.trim() || this.collection.name,
        description: this.settingsDescription.trim(),
      })
      .subscribe({
        next: () => {
          this.savingSettings = false;
          this.loadCollection(this.collection!.id);
        },
        error: (err) => {
          this.savingSettings = false;
          this.error = err.error?.error || 'Failed to save settings.';
        },
      });
  }

  saveAnalyzerSettings(): void {
    if (!this.collection || this.savingAnalyzerSettings) return;

    this.savingAnalyzerSettings = true;
    const payload: Partial<CollectionAnalyzerSettings> = {
      importantKeywords: this.settingsKeywordsText
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      ignoredPaths: this.settingsIgnoredPathsText
        .split(/\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean),
      preferredTestTypes: this.settingsPreferredTypesText
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
      allowedRiskLevel: this.analyzerSettings.allowedRiskLevel,
      maxPagesDefault: this.analyzerSettings.maxPagesDefault,
      maxActionsDefault: this.analyzerSettings.maxActionsDefault,
      alertEmail: this.monitorAlertEmail.trim(),
    };

    this.collectionService.saveAnalyzerSettings(this.collection.id, payload).subscribe({
      next: (saved) => {
        this.savingAnalyzerSettings = false;
        this.analyzerSettings = { ...this.analyzerSettings, ...saved };
        this.analyzeMessage = 'Analyzer preferences saved.';
      },
      error: (err) => {
        this.savingAnalyzerSettings = false;
        this.error = err.error?.error || 'Failed to save analyzer settings.';
      },
    });
  }

  openDeleteModal(): void {
    this.showDeleteModal = true;
    this.deleteTestsWithCollection = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
  }

  confirmDeleteCollection(): void {
    if (!this.collection || this.deleting) return;

    this.deleting = true;
    this.collectionService
      .deleteCollection(this.collection.id, this.deleteTestsWithCollection)
      .subscribe({
        next: () => {
          this.deleting = false;
          this.showDeleteModal = false;
          this.router.navigate(['/collections']);
        },
        error: (err) => {
          this.deleting = false;
          this.error = err.error?.error || 'Failed to delete collection.';
        },
      });
  }

  recentRuns(): Array<{
    test: CollectionScenario;
    status: string | null;
    at: string | null;
  }> {
    if (!this.collection) return [];
    return this.collection.scenarios
      .filter((test) => test.lastRunAt)
      .map((test) => ({
        test,
        status: test.lastRunStatus || null,
        at: test.lastRunAt || null,
      }))
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
      .slice(0, 20);
  }
}
