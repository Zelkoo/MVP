const collectionRepository = require('../testCollections/collectionRepository');

const DEFAULT_ANALYZER_SETTINGS = {
  importantKeywords: [],
  ignoredPaths: [],
  allowedRiskLevel: 'safe',
  preferredTestTypes: [],
  maxPagesDefault: 10,
  maxActionsDefault: 25,
  alertEmail: '',
};

function normalizeAnalyzerSettings(raw = {}) {
  return {
    ...DEFAULT_ANALYZER_SETTINGS,
    ...raw,
    importantKeywords: Array.isArray(raw.importantKeywords) ? raw.importantKeywords.filter(Boolean) : [],
    ignoredPaths: Array.isArray(raw.ignoredPaths) ? raw.ignoredPaths.filter(Boolean) : [],
    preferredTestTypes: Array.isArray(raw.preferredTestTypes) ? raw.preferredTestTypes.filter(Boolean) : [],
    maxPagesDefault: Math.min(parseInt(raw.maxPagesDefault, 10) || 10, 25),
    maxActionsDefault: Math.min(parseInt(raw.maxActionsDefault, 10) || 25, 50),
  };
}

function getCollectionAnalyzerSettings(collectionId) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) return DEFAULT_ANALYZER_SETTINGS;
  return normalizeAnalyzerSettings(collection.metadata?.analyzerSettings || {});
}

function saveCollectionAnalyzerSettings(collectionId, settings) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) throw new Error('Collection not found.');
  const normalized = normalizeAnalyzerSettings(settings);
  return collectionRepository.updateCollection(collectionId, {
    metadata: {
      ...collection.metadata,
      analyzerSettings: normalized,
    },
  });
}

function isPathIgnored(path, ignoredPaths = []) {
  return ignoredPaths.some((ignored) => {
    if (!ignored) return false;
    const normalized = ignored.startsWith('/') ? ignored : `/${ignored}`;
    return path === normalized || path.startsWith(`${normalized}/`);
  });
}

function scoreSuggestionWithPreferences(suggestion, settings = {}) {
  let boost = 0;
  const type = suggestion.type || suggestion.patternType || '';
  if (settings.preferredTestTypes?.includes(type)) boost += 0.2;
  if (suggestion.isComposedFlow) boost += 0.08;
  if (suggestion.safetyLevel === 'safe' || suggestion.safetyLevel === 'safe-generated-element') boost += 0.05;
  if (settings.importantKeywords?.length) {
    const haystack = `${suggestion.title} ${suggestion.description} ${suggestion.sourceUrl}`.toLowerCase();
    for (const keyword of settings.importantKeywords) {
      if (keyword && haystack.includes(keyword.toLowerCase())) boost += 0.06;
    }
  }
  return (suggestion.confidence || 0.5) + boost;
}

function recordAnalyzerRun(collectionId, runSummary) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) return null;

  const history = Array.isArray(collection.metadata?.analyzerHistory)
    ? collection.metadata.analyzerHistory
    : [];
  const entry = {
    id: `run-${Date.now()}`,
    completedAt: new Date().toISOString(),
    ...runSummary,
  };
  const nextHistory = [entry, ...history].slice(0, 20);

  return collectionRepository.updateCollection(collectionId, {
    lastAnalyzedAt: entry.completedAt,
    metadata: {
      ...collection.metadata,
      analyzerHistory: nextHistory,
      lastAnalyzerRun: entry,
    },
  });
}

function compareAnalyzerRuns(current, previous) {
  if (!current || !previous) return null;

  const currentSuggestionKeys = new Set(
    (current.suggestions || []).map((s) => `${s.type}|${s.sourceUrl}|${s.title}`)
  );
  const previousSuggestionKeys = new Set(
    (previous.suggestions || []).map((s) => `${s.type}|${s.sourceUrl}|${s.title}`)
  );

  const newSuggestions = (current.suggestions || []).filter(
    (s) => !previousSuggestionKeys.has(`${s.type}|${s.sourceUrl}|${s.title}`)
  );
  const removedSuggestions = (previous.suggestions || []).filter(
    (s) => !currentSuggestionKeys.has(`${s.type}|${s.sourceUrl}|${s.title}`)
  );

  const currentIntents = new Map((current.siteMap || []).map((page) => [page.url, page.intent]));
  const previousIntents = new Map((previous.siteMap || []).map((page) => [page.url, page.intent]));
  const changedPageIntents = [];
  for (const [url, intent] of currentIntents.entries()) {
    if (previousIntents.has(url) && previousIntents.get(url) !== intent) {
      changedPageIntents.push({ url, before: previousIntents.get(url), after: intent });
    }
  }

  return {
    newSuggestions,
    removedSuggestions,
    changedPageIntents,
    pagesNoLongerReachable: (previous.siteMap || [])
      .filter((page) => !currentIntents.has(page.url))
      .map((page) => page.url),
    newlyRiskyActions: (current.skippedActions || []).filter(
      (item) => item.safetyLevel === 'requires-confirmation' || item.safetyLevel === 'unsafe-skipped'
    ),
    summary: {
      newCount: newSuggestions.length,
      removedCount: removedSuggestions.length,
      changedIntentCount: changedPageIntents.length,
    },
  };
}

module.exports = {
  DEFAULT_ANALYZER_SETTINGS,
  normalizeAnalyzerSettings,
  getCollectionAnalyzerSettings,
  saveCollectionAnalyzerSettings,
  isPathIgnored,
  scoreSuggestionWithPreferences,
  recordAnalyzerRun,
  compareAnalyzerRuns,
};
