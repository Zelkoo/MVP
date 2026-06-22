const DEPTH_PRESETS = {
  quick: {
    maxPages: 1,
    maxActions: 10,
    maxDepth: 0,
    includeSubpages: false,
    label: 'Quick',
    description: 'Analyze the submitted page only.',
  },
  standard: {
    maxPages: 10,
    maxActions: 25,
    maxDepth: 1,
    includeSubpages: true,
    label: 'Standard',
    description: 'Analyze the start page plus useful internal pages.',
  },
  deep: {
    maxPages: 25,
    maxActions: 50,
    maxDepth: 2,
    includeSubpages: true,
    label: 'Deep',
    description: 'Broader crawl with more pages and interaction probes.',
  },
};

function resolveAnalyzerOptions(payload = {}) {
  const {
    url,
    mode = 'safe',
    depth = 'standard',
    includeSubpages,
    maxPages,
    maxActionsPerPage,
    maxActions,
  } = payload;

  const preset = DEPTH_PRESETS[depth] || DEPTH_PRESETS.standard;

  return {
    url,
    mode: mode === 'full' ? 'full' : 'safe',
    depth,
    includeSubpages: includeSubpages != null ? includeSubpages !== false : preset.includeSubpages,
    maxPages: Math.min(parseInt(maxPages ?? preset.maxPages, 10) || preset.maxPages, 25),
    maxActions: Math.min(
      parseInt(maxActionsPerPage ?? maxActions ?? preset.maxActions, 10) || preset.maxActions,
      50
    ),
    maxDepth: preset.maxDepth,
  };
}

module.exports = {
  DEPTH_PRESETS,
  resolveAnalyzerOptions,
};
