import { Scenario, ScenarioRunStatus } from './scenario.model';

export type SafetyLevel =
  | 'safe'
  | 'safe-generated-element'
  | 'requires-confirmation'
  | 'unsafe-skipped';

export interface TestCollection {
  id: number;
  name: string;
  domain: string;
  origin: string;
  startUrl: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  lastAnalyzedAt?: string | null;
  testCount?: number;
  lastRunStatus?: ScenarioRunStatus | null;
  lastRunAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CollectionScenario extends Omit<Scenario, 'metadata'> {
  collectionId?: number | null;
  sourceUrl?: string | null;
  generatedBy?: string;
  testSignature?: string | null;
  metadata?: CollectionTestMetadata;
  lastRunStatus?: ScenarioRunStatus | null;
  lastRunAt?: string | null;
}

export interface CollectionTestMetadata {
  patternType?: string;
  detectedBehavior?: {
    type?: string;
    description?: string;
  };
  safetyLevel?: SafetyLevel;
  confidence?: number;
  confidenceLevel?: string;
  sourcePageTitle?: string;
  discoveryReasons?: string[];
  category?: string;
}

export interface GroupedCollectionTests {
  path: string;
  tests: CollectionScenario[];
}

export interface CollectionDetail extends TestCollection {
  scenarios: CollectionScenario[];
  groupedTests: GroupedCollectionTests[];
  analyzerSettings?: CollectionAnalyzerSettings;
  analyzerHistory?: AnalyzerRunSummary[];
  lastAnalyzerRun?: AnalyzerRunSummary | null;
  monitoredScenarioIds?: number[];
  monitoredTests?: Record<string, MonitoredTestInfo>;
  monitoringProject?: { id: number; name: string; domain: string } | null;
  testTags?: Record<string, string[]>;
  suiteStats?: CollectionSuiteStats;
}

export interface MonitoredTestInfo {
  flowId: number;
  schedule: string;
  isActive?: boolean;
}

export interface MonitorSelectedResponse {
  projectId: number;
  projectName?: string;
  projectDomain?: string;
  created: number;
  alreadyMonitored: number;
  runJobs: Array<{ flowId: number; runId?: number; status?: string; error?: string }>;
  schedule?: string;
}

export type CollectionRunStatus =
  | 'queued'
  | 'running'
  | 'passed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export interface CollectionRunItem {
  id: number;
  collectionRunId: number;
  scenarioId: number;
  scenarioRunId?: number | null;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
  scenarioName?: string | null;
}

export interface CollectionRunResult {
  passRate?: number;
  failedTests?: Array<{
    scenarioId: number;
    scenarioName?: string | null;
    status: string;
    scenarioRunId?: number | null;
    errorMessage?: string | null;
  }>;
  error?: string;
}

export interface CollectionRun {
  id: number;
  collectionId: number;
  status: CollectionRunStatus;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number;
  parallelism?: number;
  createdAt?: string;
  result?: CollectionRunResult;
  items?: CollectionRunItem[];
  progressPercent?: number;
  completedCount?: number;
  elapsedMs?: number;
  runningTests?: string[];
}

export interface CollectionSuiteStats {
  lastCollectionRun?: CollectionRun | null;
  lastPassRate?: number | null;
  lastRunAt?: string | null;
  monitoredTestCount?: number;
  failingTestCount?: number;
}

export interface StartCollectionRunResponse {
  runId: number;
  run: CollectionRun;
}

export interface CollectionAnalyzerSettings {
  importantKeywords: string[];
  ignoredPaths: string[];
  allowedRiskLevel: 'safe' | 'full';
  preferredTestTypes: string[];
  maxPagesDefault: number;
  maxActionsDefault: number;
  alertEmail?: string;
}

export interface PageIntentEntry {
  url: string;
  path: string;
  title: string;
  intent: string;
  intentConfidence: 'high' | 'medium' | 'low';
  reasons: string[];
  importance: 'high' | 'medium' | 'low';
  behaviorCount?: number;
  suggestionCount?: number;
}

export interface VisualEvidence {
  beforeScreenshotPath?: string | null;
  afterScreenshotPath?: string | null;
  changedRegion?: { x: number; y: number; width: number; height: number } | null;
  summary?: string;
}

export interface NoResultsReport {
  summary: string;
  attempted: {
    pagesAnalyzed: number;
    clickCandidates: number;
    hoverCandidates: number;
    formCandidates: number;
    selectCandidates: number;
    checkboxCandidates: number;
    actionsProbed: number;
  };
  reasons: string[];
  nextSteps: string[];
}

export interface AnalyzerRunSummary {
  id?: string;
  completedAt?: string;
  url?: string;
  suggestionCount?: number;
  summary?: Record<string, unknown>;
}

export interface AnalyzerRunComparison {
  newSuggestions: Array<{ title: string; type: string; sourceUrl: string }>;
  removedSuggestions: Array<{ title: string; type: string; sourceUrl: string }>;
  changedPageIntents: Array<{ url: string; before: string; after: string }>;
  pagesNoLongerReachable: string[];
  newlyRiskyActions: Array<{ label?: string; reason?: string; safetyLevel?: string }>;
  summary: {
    newCount: number;
    removedCount: number;
    changedIntentCount: number;
  };
}

export interface DiscoverySuggestion {
  id: string;
  type: string;
  patternType?: string;
  category?: string;
  title: string;
  description?: string;
  businessValue?: string;
  sourceUrl: string;
  sourcePageTitle?: string;
  startUrl?: string;
  primaryLabel?: string;
  selectorOrLabel?: string;
  safetyLevel: SafetyLevel;
  confidence?: number;
  confidenceLevel?: string;
  discoveredBehavior?: {
    summary?: string;
    type?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  detectedBehavior?: {
    type?: string;
    description?: string;
  };
  generatedStepsPreview?: string[];
  generatedSteps?: Record<string, unknown>[];
  steps?: Record<string, unknown>[] | null;
  scenarioType?: string;
  config?: Record<string, unknown>;
  generatedBy?: string;
  reasoning?: string[];
  discoveryReasons?: string[];
  whySuggested?: string[];
  reliabilityScore?: number;
  flowSummary?: string;
  pagesInvolved?: string[];
  isComposedFlow?: boolean;
  pageIntent?: string;
  pageIntentLabel?: string;
  visualEvidence?: VisualEvidence | null;
}

export interface GroupedDiscoverySuggestions {
  path: string;
  suggestions: DiscoverySuggestion[];
}

export interface DiscoveryResult {
  url?: string;
  collection: TestCollection;
  pagesAnalyzed: Array<{
    url: string;
    title: string;
    status: string;
    suggestionCount: number;
  }>;
  suggestions: DiscoverySuggestion[];
  groupedSuggestions: GroupedDiscoverySuggestions[];
  skippedActions: Array<{ label?: string; reason?: string; safetyLevel?: string }>;
  warnings: Array<{ type?: string; message: string }>;
  summary?: {
    pagesAnalyzed: number;
    suggestionsFound: number;
    safeSuggestions: number;
    attemptSummary?: DiscoveryAttemptSummary;
    actionsProbed?: number;
    hoverActionsProbed?: number;
    clickActionsProbed?: number;
  };
  attemptSummary?: DiscoveryAttemptSummary;
  siteMap?: PageIntentEntry[];
  actionGraph?: Record<string, unknown>;
  noResults?: NoResultsReport | null;
}

export interface AddSuggestionsResult {
  added: number;
  skipped: number;
  errorCount: number;
  message: string;
  created?: Array<{ suggestion: DiscoverySuggestion; scenario: CollectionScenario }>;
  skippedItems?: Array<{ suggestion: DiscoverySuggestion; scenario: CollectionScenario }>;
}

export interface DiscoverySaveResult extends DiscoveryResult {
  saveResult: AddSuggestionsResult;
}

export type DiscoveryJobStatusType =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'partial';

export interface DiscoveryJobStats {
  totalPagesDiscovered: number;
  pagesDiscovered?: number;
  pagesSelected?: number;
  pagesAnalyzed: number;
  totalActionsFound: number;
  actionsProbed: number;
  hoverActionsProbed: number;
  clickActionsProbed: number;
  suggestionsFound: number;
  clickCandidates?: number;
  hoverCandidates?: number;
  formCandidates?: number;
  selectCandidates?: number;
  checkboxCandidates?: number;
  radioCandidates?: number;
  keyboardCandidates?: number;
  navigationCandidates?: number;
  unsafeActionsSkipped?: number;
}

export interface DiscoveryAttemptSummary {
  clickCandidates: number;
  hoverCandidates: number;
  formCandidates: number;
  selectCandidates: number;
  checkboxCandidates: number;
  radioCandidates: number;
  keyboardCandidates: number;
  navigationCandidates: number;
  totalCandidates: number;
}

export interface DiscoveryJobStatus {
  id: number;
  jobId: number;
  status: DiscoveryJobStatusType;
  progressPercent: number;
  currentStage?: string | null;
  currentMessage?: string | null;
  url: string;
  collection?: TestCollection | null;
  stats: DiscoveryJobStats;
  warnings: Array<{ type?: string; message: string }>;
  partialSuggestions?: DiscoverySuggestion[];
  pagesFailed?: Array<{ url: string; message: string }>;
  skippedActions?: Array<{ label?: string; reason?: string; safetyLevel?: string }>;
  errorMessage?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  updatedAt?: string;
  finishedAt?: string | null;
}

export interface DiscoveryJobStartResponse {
  jobId: number;
  id: number;
  status: DiscoveryJobStatusType;
}

export interface DiscoveryJobResult extends DiscoveryResult {
  ready?: boolean;
  status?: DiscoveryJobStatusType;
  partialSuggestions?: DiscoverySuggestion[];
  errorMessage?: string | null;
  stats?: DiscoveryJobStats;
}

export type AnalyzerDepth = 'quick' | 'standard' | 'deep';

export interface AnalyzerDepthPreset {
  maxPages: number;
  maxActions: number;
  maxDepth: number;
  includeSubpages: boolean;
  label: string;
  description: string;
}

export type AnalyzerJobStatus = DiscoveryJobStatus;
export type AnalyzerJobStartResponse = DiscoveryJobStartResponse;
export type AnalyzerJobResult = DiscoveryJobResult;
