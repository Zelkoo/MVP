const { validateUrl } = require('../../utils/urlValidator');
const { withInspectorBrowser } = require('../pageInspector/browserContext');
const { loadPageForInspection } = require('../pageInspector/loadPage');
const { analyzePage } = require('../flowSuggestions');
const collectionService = require('../testCollections/collectionService');
const collectionRepository = require('../testCollections/collectionRepository');
const { normalizeCollectionUrl, sourcePath } = require('../testCollections/normalizeCollectionUrl');
const { extractInternalLinks, planInternalPages } = require('./crawlInternalPages');
const { explorePageBehavior } = require('./pageBehaviorExplorer');
const { emptyCounts } = require('./candidateActionFinder');
const { convertSuggestionToFlowSteps } = require('../flowSuggestions/suggestionToFlow');
const { DiscoveryCancelledError } = require('./discoveryProgress');
const { classifyPageIntent } = require('./pageIntentClassifier');
const { buildActionGraph } = require('./actionGraphBuilder');
const { composeFlowSuggestions } = require('./flowComposer');
const { buildNoResultsReport } = require('./noResultsDebugger');
const {
  getCollectionAnalyzerSettings,
  recordAnalyzerRun,
  scoreSuggestionWithPreferences,
  isPathIgnored,
} = require('../testCollections/collectionAnalyzerSettings');

function groupSuggestionsByPage(suggestions, origin) {
  const groups = new Map();
  for (const suggestion of suggestions) {
    const pathKey = sourcePath(suggestion.sourceUrl || suggestion.startUrl || origin, origin);
    if (!groups.has(pathKey)) groups.set(pathKey, []);
    groups.get(pathKey).push(suggestion);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pathKey, items]) => ({ path: pathKey, suggestions: items }));
}

function mapFlowSuggestion(suggestion, pageUrl, pageTitle) {
  const startUrl = pageUrl;
  if (suggestion.type === 'broken-links' || suggestion.scenarioType === 'broken-links') {
    return {
      id: suggestion.id,
      type: suggestion.type,
      patternType: suggestion.type,
      category: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      businessValue: suggestion.businessValue,
      sourceUrl: pageUrl,
      sourcePageTitle: pageTitle,
      startUrl,
      scenarioType: 'broken-links',
      primaryLabel: suggestion.title,
      selectorOrLabel: suggestion.title,
      safetyLevel: 'safe',
      confidence: suggestion.confidence,
      confidenceLevel: suggestion.confidenceLevel,
      detectedBehavior: { type: suggestion.type, description: suggestion.description },
      discoveredBehavior: { summary: suggestion.description, type: suggestion.type },
      generatedStepsPreview: ['Open page', 'Check important links'],
      steps: null,
      config: { maxLinks: 25 },
      generatedBy: 'autopilot',
      reasoning: suggestion.suggestedReasons || [],
      discoveryReasons: suggestion.suggestedReasons || [],
    };
  }

  const steps = convertSuggestionToFlowSteps(suggestion, startUrl);
  return {
    id: suggestion.id,
    type: suggestion.type,
    patternType: suggestion.type,
    category: suggestion.type,
    title: suggestion.title,
    description: suggestion.description,
    businessValue: suggestion.businessValue,
    sourceUrl: pageUrl,
    sourcePageTitle: pageTitle,
    startUrl,
    primaryLabel: suggestion.title,
    selectorOrLabel: suggestion.detectedElements?.[0]?.label || suggestion.title,
    safetyLevel: 'safe',
    confidence: suggestion.confidence,
    confidenceLevel: suggestion.confidenceLevel,
    detectedBehavior: { type: suggestion.type, description: suggestion.description },
    discoveredBehavior: { summary: suggestion.description, type: suggestion.type },
    generatedStepsPreview: steps.filter((s) => s.action !== 'screenshot').map((s) => s.label),
    steps,
    generatedBy: 'autopilot',
    reasoning: suggestion.suggestedReasons || [],
    discoveryReasons: suggestion.suggestedReasons || [],
  };
}

function normalizeSuggestion(suggestion) {
  return {
    ...suggestion,
    reasoning: suggestion.reasoning || suggestion.discoveryReasons || [],
    discoveryReasons: suggestion.discoveryReasons || suggestion.reasoning || [],
    discoveredBehavior:
      suggestion.discoveredBehavior ||
      suggestion.detectedBehavior ||
      { summary: suggestion.description, type: suggestion.type },
    generatedStepsPreview:
      suggestion.generatedStepsPreview ||
      (suggestion.steps || []).filter((step) => step.action !== 'screenshot').map((step) => step.label),
  };
}

function pagePath(pageUrl) {
  try {
    return new URL(pageUrl).pathname || '/';
  } catch {
    return pageUrl;
  }
}

function dedupeSuggestions(suggestions) {
  const unique = [];
  const seen = new Set();
  for (const suggestion of suggestions) {
    const key = `${suggestion.patternType || suggestion.type}|${suggestion.sourceUrl}|${suggestion.title}|${suggestion.primaryLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }
  return unique.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

async function discoverBehavior(options = {}) {
  const {
    url,
    maxActions = 20,
    maxDepth = 1,
    maxPages,
    includeSubpages = true,
    mode = 'safe',
    viewport = 'desktop',
    progress = null,
  } = options;

  const pageLimit = maxPages != null ? maxPages : maxDepth === 0 ? 1 : Math.min(5 + maxDepth * 3, 12);

  return analyzeDiscovery({
    url,
    maxPages: pageLimit,
    maxActions,
    includeSubpages,
    mode,
    viewport,
    progress,
  });
}

async function analyzeDiscovery({
  url,
  maxPages = 5,
  maxActions = 20,
  includeSubpages = true,
  mode = 'safe',
  viewport = 'desktop',
  progress = null,
}) {
  const validation = await validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  progress?.throwIfCancelled?.();

  await progress?.update?.('creating-collection', 'Creating test collection…', {
    progressPercent: 8,
  });

  const normalized = normalizeCollectionUrl(validation.url);
  const collection = await collectionService.getOrCreateFromUrl(normalized.startUrl);
  const analyzerSettings = getCollectionAnalyzerSettings(collection.id);
  collectionRepository.touchAnalyzed(collection.id);

  await progress?.update?.('creating-collection', `Collection ready: ${collection.name}`, {
    progressPercent: 12,
    collectionId: collection.id,
  });

  const pagesAnalyzed = [];
  const allSuggestions = [];
  const allBehaviors = [];
  const siteMap = [];
  const skippedActions = [];
  const warnings = [];
  const pagesFailed = [];

  let pagePlan = [{ url: normalized.sourceUrl, score: 1, source: 'start' }];
  let pagesDiscovered = 1;
  let pagesSelected = 1;

  await progress?.update?.('loading-start-url', 'Loading start page…', {
    progressPercent: 15,
  });

  if (includeSubpages) {
    await progress?.update?.('extracting-internal-links', 'Finding internal links…', {
      progressPercent: 18,
    });

    await withInspectorBrowser({}, async (context) => {
      const page = await context.newPage();
      try {
        const loaded = await loadPageForInspection(page, normalized.sourceUrl);
        if (loaded.status !== 'error') {
          const resolvedStartUrl = loaded.finalUrl || normalized.sourceUrl;
          if (pagePlan[0]?.source === 'start') {
            pagePlan[0].url = resolvedStartUrl;
          }

          await progress?.update?.('checking-page-usability', 'Checking whether the page is usable…', {
            progressPercent: 20,
          });

          const links = await extractInternalLinks(page, resolvedStartUrl);
          pagesDiscovered = links.length + 1;

          await progress?.update?.('selecting-pages-to-analyze', 'Choosing the most useful pages to inspect…', {
            progressPercent: 23,
          });

          pagePlan = planInternalPages(resolvedStartUrl, links, maxPages, analyzerSettings);
          pagesSelected = pagePlan.length;

          await progress?.update?.(
            'selecting-pages-to-analyze',
            `Found ${links.length} internal links. Selected ${pagesSelected} pages to analyze.`,
            {
              progressPercent: 25,
              totalPagesDiscovered: pagesSelected,
              pagesDiscovered,
              pagesSelected,
            }
          );
        } else {
          const warning = { type: 'error', message: 'Could not load start page to discover links.' };
          warnings.push(warning);
          await progress?.warning?.(warning.type, warning.message);
        }
      } finally {
        await page.close().catch(() => {});
      }
    });
  } else {
    await withInspectorBrowser({}, async (context) => {
      const page = await context.newPage();
      try {
        const loaded = await loadPageForInspection(page, normalized.sourceUrl);
        if (loaded.status !== 'error' && pagePlan[0]?.source === 'start') {
          pagePlan[0].url = loaded.finalUrl || normalized.sourceUrl;
        }
      } finally {
        await page.close().catch(() => {});
      }
    });

    await progress?.update?.('extracting-internal-links', 'Analyzing single page only.', {
      progressPercent: 25,
      totalPagesDiscovered: 1,
      pagesDiscovered: 1,
      pagesSelected: 1,
    });
  }

  progress?.throwIfCancelled?.();

  let aggregateStats = {
    totalActionsFound: 0,
    actionsProbed: 0,
    hoverActionsProbed: 0,
    clickActionsProbed: 0,
  };
  let aggregateAttemptSummary = emptyCounts();

  for (let pageIndex = 0; pageIndex < pagePlan.length; pageIndex++) {
    progress?.throwIfCancelled?.();

    const planned = pagePlan[pageIndex];
    const pageUrl = planned.url;
    let pageTitle = pageUrl;
    const isStartPage = planned.source === 'start';
    const currentPath = pagePath(pageUrl);
    if (isPathIgnored(currentPath, analyzerSettings.ignoredPaths)) {
      continue;
    }

    const pageProgress = progress?.calculatePageProgress
      ? progress.calculatePageProgress(pageIndex, pagePlan.length)
      : 30 + Math.round(((pageIndex + 1) / pagePlan.length) * 40);

    await progress?.update?.(
      'crawling-page',
      `Analyzing page ${pageIndex + 1} of ${pagePlan.length}: ${currentPath}`,
      {
        progressPercent: pageProgress,
        pagesAnalyzed: pageIndex,
        totalPagesDiscovered: pagePlan.length,
        pagesDiscovered,
        pagesSelected: pagePlan.length,
      }
    );

    try {
      if (isStartPage) {
        await progress?.update?.('inspecting-page-structure', `Inspecting page structure on ${currentPath}…`, {
          progressPercent: pageProgress + 2,
        });

        const singlePageAnalysis = await analyzePage(pageUrl, viewport, { skipMobile: true });
        pageTitle = singlePageAnalysis.title || pageUrl;
        warnings.push(...(singlePageAnalysis.warnings || []));

        for (const suggestion of singlePageAnalysis.suggestions) {
          allSuggestions.push(normalizeSuggestion(mapFlowSuggestion(suggestion, pageUrl, pageTitle)));
        }
      }

      await progress?.update?.(
        'finding-candidate-actions',
        `Finding candidate interactions on ${currentPath}…`,
        { progressPercent: pageProgress + 4 }
      );

      await progress?.update?.(
        'probing-click-actions',
        `Probing safe interactions on ${currentPath}…`,
        { progressPercent: pageProgress + 5 }
      );

      const exploration = await explorePageBehavior(pageUrl, {
        mode,
        maxActions,
        viewport: { width: 1440, height: 900 },
        progress,
        onProbeStart: async (candidate, stats) => {
          aggregateStats = { ...aggregateStats, ...stats };
          const stage =
            candidate.actionType === 'hover'
              ? 'probing-hover-actions'
              : candidate.actionType === 'select' || candidate.actionType === 'fill'
                ? 'probing-form-controls'
                : candidate.actionType === 'check'
                  ? 'probing-checkboxes-radios'
                  : candidate.actionType === 'press'
                    ? 'probing-keyboard-actions'
                    : candidate.actionType === 'navigate'
                      ? 'probing-click-actions'
                      : 'probing-click-actions';
            await progress?.update?.(
            stage,
            `Probing ${candidate.humanLabel || 'interaction'} on ${currentPath}…`,
            {
              progressPercent: pageProgress + 6,
              totalActionsFound: stats.totalActionsFound,
              actionsProbed: stats.actionsProbed,
              hoverActionsProbed: stats.hoverActionsProbed,
              clickActionsProbed: stats.clickActionsProbed,
              suggestionsFound: dedupeSuggestions(allSuggestions).length + stats.suggestionsFound,
              partialResult: {
                partialSuggestions: dedupeSuggestions(allSuggestions),
                pagesAnalyzed,
                skippedActions,
                pagesFailed,
                warnings,
                attemptSummary: aggregateAttemptSummary,
              },
            }
          );
        },
      });

      pageTitle = exploration.pageTitle || pageTitle;
      aggregateStats.totalActionsFound += exploration.stats?.totalActionsFound || 0;
      aggregateStats.actionsProbed += exploration.stats?.actionsProbed || 0;
      aggregateStats.hoverActionsProbed += exploration.stats?.hoverActionsProbed || 0;
      aggregateStats.clickActionsProbed += exploration.stats?.clickActionsProbed || 0;

      const pageAttempt = exploration.stats?.attemptSummary || exploration.stats?.candidateCounts || emptyCounts();
      for (const key of Object.keys(aggregateAttemptSummary)) {
        aggregateAttemptSummary[key] += pageAttempt[key] || 0;
      }

      pagesAnalyzed.push({
        url: pageUrl,
        title: pageTitle,
        status: exploration.status || 'ok',
        suggestionCount: exploration.suggestions.length,
      });

      skippedActions.push(...exploration.skippedActions);
      warnings.push(...exploration.warnings);
      allBehaviors.push(...(exploration.discoveredBehaviors || []));

      const pageIntent = classifyPageIntent(
        exploration.pageState || { title: pageTitle, visibleTextSample: '', elements: [], forms: [] },
        pageUrl,
        {
          importantKeywords: analyzerSettings.importantKeywords,
          behaviorCount: exploration.discoveredBehaviors?.length || 0,
          suggestionCount: exploration.suggestions.length,
        }
      );
      siteMap.push(pageIntent);

      allSuggestions.push(...exploration.suggestions.map((suggestion) => normalizeSuggestion({
        ...suggestion,
        pageIntent: pageIntent.intent,
        pageIntentLabel: pageIntent.intent,
      })));

      const uniqueSoFar = dedupeSuggestions(allSuggestions);

      await progress?.update?.(
        'classifying-behaviors',
        `Found ${uniqueSoFar.length} possible tests so far`,
        {
          progressPercent: pageProgress + 8,
          pagesAnalyzed: pageIndex + 1,
          totalPagesDiscovered: pagePlan.length,
          suggestionsFound: uniqueSoFar.length,
          ...aggregateStats,
          partialResult: {
            partialSuggestions: uniqueSoFar,
            pagesAnalyzed,
            skippedActions,
            pagesFailed,
            warnings,
          },
        }
      );
    } catch (error) {
      if (error.name === 'DiscoveryCancelledError') throw error;

      pagesFailed.push({ url: pageUrl, message: error.message });
      warnings.push({
        type: 'page-error',
        message: `Discovery failed for ${pageUrl}: ${error.message}`,
      });
      pagesAnalyzed.push({
        url: pageUrl,
        title: pageTitle,
        status: 'error',
        suggestionCount: 0,
      });

      await progress?.warning?.('page-error', `Could not fully analyze ${currentPath}. Continuing…`);
    }
  }

  progress?.throwIfCancelled?.();

  await progress?.update?.('deduplicating-suggestions', 'Skipping duplicate tests…', {
    progressPercent: 88,
  });

  let unique = dedupeSuggestions(allSuggestions);

  await progress?.update?.('composing-flows', 'Composing multi-step test flows…', {
    progressPercent: 90,
  });

  const actionGraph = buildActionGraph({
    siteMap,
    behaviors: allBehaviors,
    suggestions: unique,
  });
  const composedFlows = composeFlowSuggestions({
    siteMap,
    behaviors: allBehaviors,
    existingSuggestions: unique,
  });
  unique = dedupeSuggestions([...unique, ...composedFlows.map((s) => normalizeSuggestion(s))]);
  unique = unique
    .map((suggestion) => ({
      ...suggestion,
      confidence: scoreSuggestionWithPreferences(suggestion, analyzerSettings),
      confidenceLevel:
        scoreSuggestionWithPreferences(suggestion, analyzerSettings) >= 0.85
          ? 'high'
          : scoreSuggestionWithPreferences(suggestion, analyzerSettings) >= 0.7
            ? 'medium'
            : 'low',
    }))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const noResults =
    unique.length === 0
      ? buildNoResultsReport({
          pagesAnalyzed,
          attemptSummary: aggregateAttemptSummary,
          skippedActions,
          aggregateStats,
          suggestions: unique,
          allowedRiskLevel: analyzerSettings.allowedRiskLevel,
        })
      : null;

  await progress?.update?.('generating-test-suggestions', 'Generating test suggestions…', {
    progressPercent: 92,
    suggestionsFound: unique.length,
    pagesAnalyzed: pagesAnalyzed.length,
    totalPagesDiscovered: pagePlan.length,
    pagesDiscovered,
    pagesSelected: pagePlan.length,
    ...aggregateStats,
  });

  const result = {
    url: normalized.sourceUrl,
    collection: {
      ...collection,
      ...collectionRepository.getCollectionStats(collection.id),
    },
    siteMap,
    actionGraph,
    pagesDiscovered,
    pagesSelected: pagePlan.length,
    pagesAnalyzed,
    pagesFailed,
    suggestions: unique,
    groupedSuggestions: groupSuggestionsByPage(unique, collection.origin),
    skippedActions,
    warnings,
    partialSuggestions: unique,
    noResults,
    summary: {
      pagesAnalyzed: pagesAnalyzed.length,
      pagesDiscovered,
      pagesSelected: pagePlan.length,
      suggestionsFound: unique.length,
      composedFlows: composedFlows.length,
      safeSuggestions: unique.filter(
        (s) => s.safetyLevel === 'safe' || s.safetyLevel === 'safe-generated-element'
      ).length,
      attemptSummary: aggregateAttemptSummary,
      ...aggregateStats,
    },
    attemptSummary: aggregateAttemptSummary,
  };

  recordAnalyzerRun(collection.id, {
    url: normalized.sourceUrl,
    suggestions: unique.map((s) => ({ id: s.id, type: s.type, title: s.title, sourceUrl: s.sourceUrl })),
    siteMap,
    skippedActions,
    summary: result.summary,
    suggestionCount: unique.length,
  });

  await progress?.update?.('completed', `Discovery complete — found ${unique.length} possible tests.`, {
    progressPercent: 98,
    suggestionsFound: unique.length,
  });

  return result;
}

module.exports = {
  analyzeDiscovery,
  discoverBehavior,
  groupSuggestionsByPage,
  normalizeSuggestion,
  dedupeSuggestions,
};
