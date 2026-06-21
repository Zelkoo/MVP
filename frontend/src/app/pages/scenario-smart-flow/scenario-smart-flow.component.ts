import { Component, inject, OnDestroy, OnInit } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormsModule } from '@angular/forms';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ScenarioService } from '../../services/scenario.service';
import { FlowSuggestionService } from '../../services/flow-suggestion.service';
import { FlowAnalysisService } from '../../services/flow-analysis.service';
import { AnalyzerService, AnalyzerDepth } from '../../services/analyzer.service';
import { CollectionService } from '../../services/collection.service';

import { ErrorMessageComponent } from '../../components/error-message/error-message.component';

import { LoadingComponent } from '../../components/loading/loading.component';

import { PagePreviewPickerComponent } from '../../components/page-preview-picker/page-preview-picker.component';
import { SuccessConditionAssistantComponent } from '../../components/success-condition-assistant/success-condition-assistant.component';
import { TestReliabilityScoreComponent } from '../../components/test-reliability-score/test-reliability-score.component';

import { InspectedElement, PageInspectionResult, previewStatusLabel } from '../../models/page-inspector.model';

import {

  FlowAnalysisResult,

  FlowSuggestion,

  GeneratedStep,

  SuccessStrategy,

} from '../../models/flow-suggestion.model';

import { ScenarioRun } from '../../models/scenario.model';

import { FlowStepDefinition, serializeSteps } from '../../utils/flow-templates';

import {

  SUCCESS_STRATEGY_LABELS,

  confidenceBadgeClass,

  confidenceHint,

  convertSuggestionToFlowSteps,

  describeSuccessStrategy,

  getSuccessStrategies,

  plainGeneratedStepSummary,

  reliabilityLabel,

  suggestionFlowName,

  usesBrokenLinksScenario,

} from '../../utils/suggestion-to-flow';

import { analysisToInspection } from '../../utils/wizard-from-suggestion';

import { buildElementTargetFields } from '../../utils/element-target';

import { developerStepPreview, plainStepDescription } from '../../utils/flow-wizard';

import { stepResultSummary } from '../../utils/element-target';
import {
  applySelectedSuccessConditions,
  splitFlowSteps,
} from '../../utils/success-condition.util';

import {
  DiscoveryJobStatus,
  DiscoveryResult,
  DiscoverySuggestion,
  NoResultsReport,
  PageIntentEntry,
  SafetyLevel,
  VisualEvidence,
} from '../../models/collection.model';



type ViewMode = 'analyze' | 'suggestions' | 'discovery' | 'review';



@Component({

  selector: 'app-scenario-smart-flow',

  standalone: true,

  imports: [

    CommonModule,

    FormsModule,

    RouterLink,

    ErrorMessageComponent,

    LoadingComponent,

    PagePreviewPickerComponent,

    SuccessConditionAssistantComponent,

    TestReliabilityScoreComponent,

  ],

  templateUrl: './scenario-smart-flow.component.html',

  styleUrl: './scenario-smart-flow.component.css',

})

export class ScenarioSmartFlowComponent implements OnInit, OnDestroy {

  private readonly scenarioService = inject(ScenarioService);
  private readonly suggestionService = inject(FlowSuggestionService);
  private readonly flowAnalysisService = inject(FlowAnalysisService);
  private readonly analyzerService = inject(AnalyzerService);
  private readonly collectionService = inject(CollectionService);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);



  viewMode: ViewMode = 'analyze';

  flowName = '';

  startUrl = '';

  analyzing = false;
  discovering = false;
  discoveryJob: DiscoveryJobStatus | null = null;
  discoveryJobId: number | null = null;
  discoveryStartedAt: number | null = null;
  cancellingDiscovery = false;
  private discoveryPollTimer: ReturnType<typeof setInterval> | null = null;
  addingToCollection = false;

  analyzeViewport: 'desktop' | 'mobile' = 'desktop';

  saving = false;

  running = false;

  error: string | null = null;

  showAdvancedOptions = false;
  analyzerDepth: AnalyzerDepth = 'standard';
  includeSubpages = true;
  analyzerMaxPages = 10;
  analyzerMaxActions = 25;



  analysis: FlowAnalysisResult | null = null;
  discovery: DiscoveryResult | null = null;
  discoveryMessage: string | null = null;
  ignoredDiscoveryIds = new Set<string>();
  expandedDiscoveryId: string | null = null;
  expandedReasoningId: string | null = null;
  expandedVisualId: string | null = null;
  visualEvidenceMode: 'before' | 'after' = 'after';
  runningDiscoveryId: string | null = null;

  selectedSuggestion: FlowSuggestion | null = null;

  selectedSuccessStrategy: SuccessStrategy | null = null;

  generatedSteps: FlowStepDefinition[] = [];

  expandedSuggestionId: string | null = null;

  showAdvancedDetails = false;

  showAdvancedEditor = false;

  correctingStepIndex: number | null = null;



  runningSuggestionId: string | null = null;

  cardRuns = new Map<string, ScenarioRun>();

  cardRunErrors = new Map<string, string>();

  cardDevDetailsOpen = new Map<string, Set<number>>();
  cardSuccessChecks = new Map<string, string>();



  successStrategyLabels = SUCCESS_STRATEGY_LABELS;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const url = params.get('url');
      const mode = params.get('mode');
      if (url) {
        this.startUrl = url;
      }
      if (mode === 'discover' && url) {
        this.discoverTests();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopDiscoveryPolling();
  }

  stageLabel(stage: string | null | undefined): string {
    const labels: Record<string, string> = {
      queued: 'Starting',
      'creating-collection': 'Creating collection',
      'loading-start-url': 'Loading start page',
      'loading-start-page': 'Loading start page',
      'checking-page-usability': 'Checking page usability',
      'extracting-internal-links': 'Finding internal links',
      'extracting-links': 'Finding internal links',
      'selecting-pages-to-analyze': 'Selecting pages to analyze',
      'crawling-page': 'Analyzing page',
      'crawling-pages': 'Analyzing pages',
      'inspecting-page-structure': 'Inspecting page structure',
      'inspecting-elements': 'Inspecting page structure',
      'finding-candidate-actions': 'Finding candidate interactions',
      'probing-click-actions': 'Probing click actions',
      'probing-hover-actions': 'Probing hover actions',
      'probing-form-controls': 'Probing form controls',
      'probing-selects': 'Probing selects',
      'probing-checkboxes-radios': 'Probing checkboxes and radios',
      'probing-keyboard-actions': 'Probing keyboard actions',
      'comparing-page-states': 'Comparing page states',
      'diffing-page-state': 'Detecting behavior changes',
      'classifying-behaviors': 'Classifying behaviors',
      'generating-test-suggestions': 'Generating test suggestions',
      'generating-suggestions': 'Generating test suggestions',
      'deduplicating-suggestions': 'Skipping duplicates',
      'deduplicating-tests': 'Skipping duplicates',
      'composing-flows': 'Composing multi-step flows',
      'saving-to-collection': 'Saving tests to collection',
      completed: 'Finished',
      failed: 'Failed',
      partial: 'Finished with warnings',
      cancelled: 'Cancelled',
    };
    return labels[stage || ''] || 'Analyzing website';
  }

  discoveryElapsedLabel(): string {
    if (!this.discoveryStartedAt) return '';
    const seconds = Math.floor((Date.now() - this.discoveryStartedAt) / 1000);
    if (seconds < 60) return `${seconds}s elapsed`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
  }

  discoveryReassurance(): string | null {
    if (!this.discoveryStartedAt || !this.discovering) return null;
    const seconds = Math.floor((Date.now() - this.discoveryStartedAt) / 1000);
    if (seconds >= 180) {
      return 'This is taking longer than usual. You can keep waiting, cancel, or reduce max pages/actions.';
    }
    if (seconds >= 60) {
      return 'Still working. We are safely exploring the site and testing possible interactions.';
    }
    return null;
  }

  cancelDiscovery(): void {
    if (!this.discoveryJobId || this.cancellingDiscovery) return;
    this.cancellingDiscovery = true;
    this.analyzerService.cancelJob(this.discoveryJobId).subscribe({
      next: (job) => {
        this.cancellingDiscovery = false;
        this.discoveryJob = job;
        this.finishDiscoveryJob(job);
      },
      error: () => {
        this.cancellingDiscovery = false;
      },
    });
  }

  private stopDiscoveryPolling(): void {
    if (this.discoveryPollTimer) {
      clearInterval(this.discoveryPollTimer);
      this.discoveryPollTimer = null;
    }
  }

  private startDiscoveryPolling(): void {
    this.stopDiscoveryPolling();
    this.pollDiscoveryJob();
    this.discoveryPollTimer = setInterval(() => this.pollDiscoveryJob(), 1500);
  }

  private pollDiscoveryJob(): void {
    if (!this.discoveryJobId) return;
    this.analyzerService.getJob(this.discoveryJobId).subscribe({
      next: (job) => {
        this.discoveryJob = job;
        if (['completed', 'failed', 'partial', 'cancelled'].includes(job.status)) {
          this.finishDiscoveryJob(job);
        }
      },
      error: (err) => {
        this.stopDiscoveryPolling();
        this.discovering = false;
        this.error = err.error?.error || 'Lost connection to discovery job.';
      },
    });
  }

  private finishDiscoveryJob(job: DiscoveryJobStatus): void {
    this.stopDiscoveryPolling();
    this.discovering = false;

    if (job.status === 'failed' && !(job.partialSuggestions?.length || job.stats.suggestionsFound)) {
      this.error = job.errorMessage || 'Discovery failed before completion.';
      this.viewMode = 'analyze';
      return;
    }

    if (!this.discoveryJobId) return;

    this.analyzerService.getJobResult(this.discoveryJobId).subscribe({
      next: (result) => {
        if (result.ready === false) return;

        this.error = null;
        this.discovery = {
          url: result.url || job.url,
          collection: result.collection || job.collection || ({} as DiscoveryResult['collection']),
          pagesAnalyzed: result.pagesAnalyzed || [],
          suggestions: result.suggestions || result.partialSuggestions || [],
          groupedSuggestions: result.groupedSuggestions || [],
          skippedActions: result.skippedActions || [],
          warnings: result.warnings || [],
          summary: result.summary,
          attemptSummary: result.attemptSummary || result.summary?.attemptSummary,
          siteMap: result.siteMap || [],
          noResults: result.noResults || null,
        };

        if (job.status === 'partial' || job.status === 'cancelled') {
          this.discoveryMessage =
            job.status === 'cancelled'
              ? `Discovery cancelled. Showing ${this.discovery.suggestions.length} suggestions found so far.`
              : `Discovery finished with warnings. Found ${this.discovery.suggestions.length} possible tests.`;
        } else if (job.status === 'completed') {
          if (this.discovery.suggestions.length === 0) {
            this.discoveryMessage = this.discovery.noResults?.summary || 'We did not find reliable safe test suggestions.';
          } else {
            const composed = (result.summary as { composedFlows?: number })?.composedFlows || 0;
            this.discoveryMessage = `Found ${this.discovery.suggestions.length} possible tests across ${this.discovery.pagesAnalyzed.length} pages${composed ? `, including ${composed} multi-step flows` : ''}.`;
          }
        } else if (job.status === 'failed') {
          this.error = result.errorMessage || job.errorMessage || 'Discovery failed before completion.';
        }

        this.viewMode = 'discovery';
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load discovery results.';
      },
    });
  }

  get visibleDiscoveryGroups() {
    if (!this.discovery) return [];
    return this.discovery.groupedSuggestions
      .map((group) => ({
        ...group,
        suggestions: group.suggestions.filter((s) => !this.ignoredDiscoveryIds.has(s.id)),
      }))
      .filter((group) => group.suggestions.length > 0);
  }

  get discoveryAttemptSummary() {
    return this.discovery?.attemptSummary || this.discovery?.summary?.attemptSummary || null;
  }

  get safeDiscoverySuggestions(): DiscoverySuggestion[] {
    if (!this.discovery) return [];
    return this.discovery.suggestions.filter(
      (s) =>
        !this.ignoredDiscoveryIds.has(s.id) &&
        (s.safetyLevel === 'safe' || s.safetyLevel === 'safe-generated-element')
    );
  }



  get inspectionPreview(): PageInspectionResult | null {

    return this.analysis ? analysisToInspection(this.analysis) : null;

  }



  get analysisStatusLabel(): string {

    return previewStatusLabel(this.inspectionPreview, this.analyzing);

  }



  get analysisBlocked(): boolean {

    return this.analysis?.status === 'blocked' || this.analysis?.status === 'timeout';

  }



  get analysisPartial(): boolean {

    return this.analysis?.status === 'partial';

  }



  generateTests(viewport: 'desktop' | 'mobile' = this.analyzeViewport): void {

    const url = this.startUrl.trim();

    if (!url) {

      this.error = 'Enter a website URL to generate tests.';

      return;

    }



    this.analyzeViewport = viewport;

    this.analyzing = true;
    this.discovering = false;

    this.error = null;

    this.analysis = null;
    this.discovery = null;
    this.discoveryMessage = null;

    this.selectedSuggestion = null;

    this.cardRuns.clear();

    this.cardRunErrors.clear();

    this.cardDevDetailsOpen.clear();
    this.cardSuccessChecks.clear();

    this.viewMode = 'analyze';



    this.suggestionService.analyzePage({ url, viewport }).subscribe({

      next: (result) => {

        this.analysis = result;

        this.analyzing = false;

        this.viewMode = 'suggestions';

        if (!this.flowName.trim() && result.suggestions[0]) {

          this.flowName = suggestionFlowName(result.suggestions[0]);

        }

      },

      error: (err) => {

        this.analyzing = false;

        this.error = err.error?.error || 'Failed to generate tests.';

      },

    });

  }

  onDepthChange(): void {
    if (this.analyzerDepth === 'quick') {
      this.includeSubpages = false;
      this.analyzerMaxPages = 1;
      this.analyzerMaxActions = 10;
    } else if (this.analyzerDepth === 'standard') {
      this.includeSubpages = true;
      this.analyzerMaxPages = 10;
      this.analyzerMaxActions = 25;
    } else {
      this.includeSubpages = true;
      this.analyzerMaxPages = 25;
      this.analyzerMaxActions = 50;
    }
  }

  discoverTests(): void {
    const url = this.startUrl.trim();
    if (!url) {
      this.error = 'Enter a website URL to discover tests.';
      return;
    }

    this.stopDiscoveryPolling();
    this.discovering = true;
    this.analyzing = false;
    this.error = null;
    this.analysis = null;
    this.discovery = null;
    this.discoveryMessage = null;
    this.discoveryJob = null;
    this.discoveryJobId = null;
    this.discoveryStartedAt = Date.now();
    this.ignoredDiscoveryIds.clear();
    this.viewMode = 'analyze';

    this.analyzerService
      .startJob({
        url,
        depth: this.analyzerDepth,
        includeSubpages: this.includeSubpages,
        maxPages: this.analyzerMaxPages,
        maxActionsPerPage: this.analyzerMaxActions,
        mode: 'safe',
      })
      .subscribe({
        next: (job) => {
          this.discoveryJobId = job.jobId || job.id;
          this.discoveryJob = {
            id: job.id,
            jobId: job.jobId || job.id,
            status: job.status,
            progressPercent: 2,
            url,
            stats: {
              totalPagesDiscovered: 0,
              pagesAnalyzed: 0,
              totalActionsFound: 0,
              actionsProbed: 0,
              hoverActionsProbed: 0,
              clickActionsProbed: 0,
              suggestionsFound: 0,
            },
            warnings: [],
            currentStage: 'queued',
            currentMessage: 'Starting website analysis…',
          };
          this.startDiscoveryPolling();
        },
        error: (err) => {
          this.discovering = false;
          if (err.status === 0) {
            this.error = 'Could not reach the server. Make sure the backend is running.';
          } else {
            this.error = err.error?.error || err.message || 'Failed to start discovery.';
          }
        },
      });
  }

  get discoveryNoResults(): NoResultsReport | null {
    return this.discovery?.noResults || null;
  }

  get discoverySiteMap(): PageIntentEntry[] {
    return this.discovery?.siteMap || [];
  }

  intentLabel(intent: string | undefined): string {
    const labels: Record<string, string> = {
      homepage: 'Homepage',
      contact: 'Contact',
      'lead-generation': 'Lead generation',
      login: 'Login',
      signup: 'Signup',
      product: 'Product',
      ecommerce: 'Ecommerce',
      cart: 'Cart',
      'checkout-start': 'Checkout',
      pricing: 'Conversion / Pricing',
      booking: 'Booking',
      search: 'Search',
      dashboard: 'Dashboard',
      'content/article': 'Content',
      documentation: 'Documentation',
      'demo-interactive': 'Interactive demo',
      unknown: 'General page',
    };
    return labels[intent || 'unknown'] || intent || 'General page';
  }

  intentBadgeClass(entry: PageIntentEntry): string {
    return `intent-${entry.intent}`;
  }

  toggleVisualEvidence(suggestion: DiscoverySuggestion): void {
    this.expandedVisualId = this.expandedVisualId === suggestion.id ? null : suggestion.id;
    this.visualEvidenceMode = 'after';
  }

  visualEvidenceFor(suggestion: DiscoverySuggestion): VisualEvidence | null {
    return suggestion.visualEvidence || null;
  }

  evidenceScreenshot(path: string | null | undefined): string | null {
    return this.scenarioService.screenshotUrl(path);
  }

  setVisualEvidenceMode(mode: 'before' | 'after'): void {
    this.visualEvidenceMode = mode;
  }

  activeEvidencePath(evidence: VisualEvidence | null): string | null {
    if (!evidence) return null;
    return this.visualEvidenceMode === 'before'
      ? evidence.beforeScreenshotPath || null
      : evidence.afterScreenshotPath || null;
  }

  discoverySourcePath(suggestion: DiscoverySuggestion): string {
    try {
      return new URL(suggestion.sourceUrl).pathname || '/';
    } catch {
      return suggestion.sourceUrl;
    }
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

  toggleReasoning(suggestion: DiscoverySuggestion): void {
    this.expandedReasoningId =
      this.expandedReasoningId === suggestion.id ? null : suggestion.id;
  }

  suggestionWhySuggested(suggestion: DiscoverySuggestion): string[] {
    return suggestion.whySuggested || suggestion.reasoning || suggestion.discoveryReasons || [];
  }

  discoveredSummary(suggestion: DiscoverySuggestion): string {
    return (
      suggestion.discoveredBehavior?.summary ||
      suggestion.detectedBehavior?.description ||
      suggestion.description ||
      ''
    );
  }

  toggleDiscoverySteps(suggestion: DiscoverySuggestion): void {
    this.expandedDiscoveryId =
      this.expandedDiscoveryId === suggestion.id ? null : suggestion.id;
  }

  ignoreDiscoverySuggestion(suggestion: DiscoverySuggestion): void {
    this.ignoredDiscoveryIds.add(suggestion.id);
  }

  addDiscoveryToCollection(suggestion: DiscoverySuggestion, runAfter = false): void {
    if (!this.discovery?.collection.id || this.addingToCollection) return;

    this.addingToCollection = true;
    this.discoveryMessage = null;
    this.error = null;

    this.collectionService.addSuggestions(this.discovery.collection.id, [suggestion]).subscribe({
      next: (result) => {
        this.addingToCollection = false;
        this.discoveryMessage = result.message;
        if (runAfter && result.created?.[0]?.scenario?.id) {
          this.runDiscoveryScenario(result.created[0].scenario.id!, suggestion.id);
        }
      },
      error: (err) => {
        this.addingToCollection = false;
        this.error = err.error?.error || 'Failed to add test to collection.';
      },
    });
  }

  addAllSafeToCollection(): void {
    if (!this.discovery?.collection.id || this.addingToCollection) return;
    const suggestions = this.safeDiscoverySuggestions;
    if (suggestions.length === 0) return;

    this.addingToCollection = true;
    this.discoveryMessage = null;
    this.collectionService.addSuggestions(this.discovery.collection.id, suggestions).subscribe({
      next: (result) => {
        this.addingToCollection = false;
        this.discoveryMessage = result.message;
      },
      error: (err) => {
        this.addingToCollection = false;
        this.error = err.error?.error || 'Failed to add tests to collection.';
      },
    });
  }

  private runDiscoveryScenario(scenarioId: number, suggestionId: string): void {
    this.runningDiscoveryId = suggestionId;
    this.scenarioService.runScenario(scenarioId, { recordVideo: true }).subscribe({
      next: (run) => {
        this.runningDiscoveryId = null;
        if (run.id) this.router.navigate(['/scenario-runs', run.id]);
      },
      error: (err) => {
        this.runningDiscoveryId = null;
        if (err.error?.id) {
          this.router.navigate(['/scenario-runs', err.error.id]);
          return;
        }
        this.error = err.error?.error || 'Test was saved but the run failed.';
      },
    });
  }

  isRunningDiscovery(suggestion: DiscoverySuggestion): boolean {
    return this.runningDiscoveryId === suggestion.id;
  }

  openCollection(): void {
    if (this.discovery?.collection.id) {
      this.router.navigate(['/collections', this.discovery.collection.id]);
    }
  }



  retryMobileAnalysis(): void {

    this.generateTests('mobile');

  }



  togglePreviewSteps(suggestion: FlowSuggestion): void {

    this.expandedSuggestionId =

      this.expandedSuggestionId === suggestion.id ? null : suggestion.id;

  }



  isRunningSuggestion(suggestion: FlowSuggestion): boolean {

    return this.runningSuggestionId === suggestion.id;

  }



  cardRunResult(suggestion: FlowSuggestion): ScenarioRun | null {

    return this.cardRuns.get(suggestion.id) || null;

  }



  cardRunError(suggestion: FlowSuggestion): string | null {

    return this.cardRunErrors.get(suggestion.id) || null;

  }



  createAndRun(suggestion: FlowSuggestion): void {
    if (this.runningSuggestionId) return;

    this.runningSuggestionId = suggestion.id;
    this.cardRuns.delete(suggestion.id);
    this.cardRunErrors.delete(suggestion.id);
    this.cardSuccessChecks.delete(suggestion.id);
    this.error = null;

    const startUrl = this.startUrl.trim();
    const defaultSteps = this.suggestionSteps(suggestion);

    if (this.shouldDryRunSuccess(suggestion, defaultSteps)) {
      const { actionSteps, screenshotSteps } = splitFlowSteps(defaultSteps);
      this.flowAnalysisService
        .analyzeSuccessConditions({
          startUrl,
          steps: serializeSteps(actionSteps, startUrl),
          viewport: this.suggestionViewport(suggestion),
        })
        .subscribe({
          next: (dryRun) => {
            const best = dryRun.suggestions[0];
            if (best) {
              this.cardSuccessChecks.set(suggestion.id, best.plainLanguage);
              const steps = applySelectedSuccessConditions(actionSteps, [best], screenshotSteps);
              this.createAndRunWithSteps(suggestion, steps);
              return;
            }
            this.createAndRunWithSteps(suggestion, defaultSteps);
          },
          error: () => {
            this.createAndRunWithSteps(suggestion, defaultSteps);
          },
        });
      return;
    }

    this.createAndRunWithSteps(suggestion, defaultSteps);
  }

  suggestionSteps(suggestion: FlowSuggestion): FlowStepDefinition[] {
    return convertSuggestionToFlowSteps(
      suggestion,
      this.startUrl.trim(),
      getSuccessStrategies(suggestion.generatedSteps)[0]
    );
  }

  cardSuccessCheck(suggestion: FlowSuggestion): string | null {
    return this.cardSuccessChecks.get(suggestion.id) || null;
  }

  private shouldDryRunSuccess(suggestion: FlowSuggestion, steps: FlowStepDefinition[]): boolean {
    if (usesBrokenLinksScenario(suggestion)) return false;
    const { actionSteps } = splitFlowSteps(steps);
    return actionSteps.some((step) => step.action === 'click' || step.action === 'fill');
  }

  private suggestionViewport(suggestion: FlowSuggestion): { width: number; height: number } | undefined {
    return suggestion.viewport === 'mobile' || this.analyzeViewport === 'mobile'
      ? { width: 390, height: 844 }
      : undefined;
  }

  private createAndRunWithSteps(suggestion: FlowSuggestion, steps: FlowStepDefinition[]): void {
    const name = suggestionFlowName(suggestion);
    const startUrl = this.startUrl.trim();
    const payload = usesBrokenLinksScenario(suggestion)
      ? {
          name,
          type: 'broken-links' as const,
          startUrl,
          config: { maxLinks: 25 },
        }
      : {
          name,
          type: 'flow' as const,
          startUrl,
          config: {
            steps: serializeSteps(steps, startUrl),
            viewport: this.suggestionViewport(suggestion),
          },
        };

    this.scenarioService.createScenario(payload).subscribe({
      next: (scenario) => {
        if (!scenario.id) {
          this.runningSuggestionId = null;
          this.cardRunErrors.set(suggestion.id, 'Failed to create the test.');
          return;
        }

        this.scenarioService.runScenario(scenario.id, { recordVideo: true }).subscribe({
          next: (run) => {
            this.runningSuggestionId = null;
            this.cardRuns.set(suggestion.id, run);
          },
          error: (err) => {
            this.runningSuggestionId = null;
            if (err.error?.id) {
              this.scenarioService.getScenarioRun(err.error.id).subscribe({
                next: (run) => this.cardRuns.set(suggestion.id, run),
                error: () =>
                  this.cardRunErrors.set(
                    suggestion.id,
                    err.error?.error || 'The test was created but the run failed.'
                  ),
              });
              return;
            }
            this.cardRunErrors.set(
              suggestion.id,
              err.error?.error || 'The test was created but the run failed.'
            );
          },
        });
      },
      error: (err) => {
        this.runningSuggestionId = null;
        this.cardRunErrors.set(suggestion.id, err.error?.error || 'Failed to create the test.');
      },
    });
  }



  customizeSuggestion(suggestion: FlowSuggestion): void {

    this.selectedSuggestion = suggestion;

    this.flowName = suggestionFlowName(suggestion);

    const strategies = getSuccessStrategies(suggestion.generatedSteps);

    this.selectedSuccessStrategy = strategies[0] || null;

    this.refreshGeneratedSteps();

    this.viewMode = 'review';

    this.error = null;

  }



  successStrategies(): SuccessStrategy[] {

    if (!this.selectedSuggestion) return [];

    return getSuccessStrategies(this.selectedSuggestion.generatedSteps);

  }



  applySuccessStrategy(strategy: SuccessStrategy): void {

    if (!this.selectedSuggestion) return;

    this.selectedSuccessStrategy = strategy;

    this.refreshGeneratedSteps();

  }



  refreshGeneratedSteps(): void {

    if (!this.selectedSuggestion) return;

    this.generatedSteps = convertSuggestionToFlowSteps(

      this.selectedSuggestion,

      this.startUrl.trim(),

      this.selectedSuccessStrategy || undefined

    );

  }



  plainStep(step: FlowStepDefinition): string {

    return plainStepDescription(step, this.startUrl.trim());

  }



  devStep(step: FlowStepDefinition): string {

    return developerStepPreview(step);

  }



  previewStepSummary(step: GeneratedStep): string {

    return plainGeneratedStepSummary(step, this.startUrl.trim());

  }



  confidenceClass(suggestion: FlowSuggestion): string {

    return confidenceBadgeClass(suggestion.confidenceLabel, suggestion.confidenceLevel);

  }



  confidenceMessage(suggestion: FlowSuggestion): string {

    return confidenceHint(suggestion.confidenceLabel, suggestion.confidenceLevel);

  }



  reliabilityText(suggestion: FlowSuggestion): string {

    return reliabilityLabel(suggestion.estimatedReliability);

  }



  describeStrategy(strategy: SuccessStrategy): string {

    return describeSuccessStrategy(strategy);

  }



  startCorrectingStep(index: number): void {

    this.correctingStepIndex = index;

    this.error = null;

  }



  cancelCorrectingStep(): void {

    this.correctingStepIndex = null;

  }



  onCorrectionSelected(element: InspectedElement): void {

    if (this.correctingStepIndex == null) return;

    const fields = buildElementTargetFields(element);

    this.generatedSteps = this.generatedSteps.map((step, index) =>

      index === this.correctingStepIndex

        ? {

            ...step,

            ...fields,

            label: step.label,

            elementLabel: fields.elementLabel || step.elementLabel,

          }

        : step

    );

    this.correctingStepIndex = null;

  }



  updateGeneratedStep(index: number, patch: Partial<FlowStepDefinition>): void {

    this.generatedSteps = this.generatedSteps.map((step, stepIndex) =>

      stepIndex === index ? { ...step, ...patch } : step

    );

  }



  get assistantViewport(): { width: number; height: number } | undefined {

    return this.selectedSuggestion?.viewport === 'mobile' || this.analyzeViewport === 'mobile'

      ? { width: 390, height: 844 }

      : undefined;

  }



  onAssistantStepsChange(steps: FlowStepDefinition[]): void {

    this.generatedSteps = steps;

  }



  backToSuggestions(): void {

    this.viewMode = 'suggestions';

    this.selectedSuggestion = null;

    this.generatedSteps = [];

    this.correctingStepIndex = null;

  }



  saveAndRun(): void {

    this.persistFlow(true);

  }



  saveOnly(): void {

    this.persistFlow(false);

  }



  runScreenshotUrl(run: ScenarioRun | null): string | null {

    return this.scenarioService.screenshotUrl(run?.screenshotPath);

  }



  stepScreenshot(path: string | null | undefined): string | null {

    return this.scenarioService.screenshotUrl(path);

  }



  runStatusClass(run: ScenarioRun | null): string {

    return `status-${run?.status || 'unknown'}`;

  }



  runStepSummary(step: ScenarioRun['result']['steps'][number]): string {

    return stepResultSummary({

      name: step.name,

      action: step.action,

      status: step.status,

      message: step.message,

      selectorStrategy: step.selectorStrategy,

    });

  }



  runStepHasDevDetails(step: ScenarioRun['result']['steps'][number]): boolean {

    return Boolean(step.attempts?.length || step.technicalDetails || step.selectorUsed);

  }



  toggleCardDevDetails(suggestionId: string, index: number): void {

    const open = this.cardDevDetailsOpen.get(suggestionId) || new Set<number>();

    if (open.has(index)) open.delete(index);

    else open.add(index);

    this.cardDevDetailsOpen.set(suggestionId, open);

  }



  cardDevDetailsVisible(suggestionId: string, index: number): boolean {

    return this.cardDevDetailsOpen.get(suggestionId)?.has(index) || false;

  }



  primaryIssue(run: ScenarioRun | null): { message: string; recommendation?: string | null } | null {

    if (!run?.result.issues?.length) return null;

    const issue = run.result.issues.find((entry) => entry.severity === 'critical') || run.result.issues[0];

    return {

      message: issue.message,

      recommendation: issue.recommendation,

    };

  }



  selectorConfidence(run: ScenarioRun | null): string {

    if (!run?.result.steps?.length) return 'Unknown';

    const interactiveSteps = run.result.steps.filter(

      (step) => step.selectorStrategy && step.action && step.action !== 'goto'

    );

    if (interactiveSteps.length === 0) return 'Not applicable';

    const primaryCount = interactiveSteps.filter((step) => step.selectorStrategy === 'primary').length;

    if (primaryCount === interactiveSteps.length) return 'High — primary selectors worked';

    if (primaryCount > 0) return 'Medium — some fallback selectors were used';

    return 'Low — fallback selectors were needed';

  }



  private persistFlow(runAfterSave: boolean): void {

    if (!this.startUrl.trim() || this.generatedSteps.length === 0) {

      this.error = 'Generate a test before saving.';

      return;

    }



    this.saving = true;

    this.running = runAfterSave;

    this.error = null;



    this.scenarioService

      .createScenario({

        name: this.flowName.trim() || 'Generated flow test',

        type: 'flow',

        startUrl: this.startUrl.trim(),

        config: {

          steps: serializeSteps(this.generatedSteps, this.startUrl.trim()),

          viewport:

            this.selectedSuggestion?.viewport === 'mobile' || this.analyzeViewport === 'mobile'

              ? { width: 390, height: 844 }

              : undefined,

        },

      })

      .subscribe({

        next: (scenario) => {

          if (!scenario.id) {

            this.saving = false;

            this.running = false;

            this.error = 'Failed to save test.';

            return;

          }



          if (!runAfterSave) {

            this.saving = false;

            this.router.navigate(['/scenarios', scenario.id]);

            return;

          }



          this.scenarioService.runScenario(scenario.id, { recordVideo: true }).subscribe({

            next: (run) => {

              this.saving = false;

              this.running = false;

              if (run.id) this.router.navigate(['/scenario-runs', run.id]);

            },

            error: (err) => {

              this.saving = false;

              this.running = false;

              if (err.error?.id) {

                this.router.navigate(['/scenario-runs', err.error.id]);

                return;

              }

              this.error = err.error?.error || 'Test saved but run failed.';

            },

          });

        },

        error: (err) => {

          this.saving = false;

          this.running = false;

          this.error = err.error?.error || 'Failed to save test.';

        },

      });

  }

}


