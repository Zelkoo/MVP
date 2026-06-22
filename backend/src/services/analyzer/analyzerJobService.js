const jobRepository = require('../testDiscovery/discoveryJobRepository');
const {
  createDiscoveryJob,
  getJobResult,
  cancelJob,
  formatJobResponse,
} = require('../testDiscovery/discoveryJobService');
const { resolveAnalyzerOptions } = require('./analyzerConfig');

function buildAnalyzerStats(job) {
  const attempt = job.result?.attemptSummary || job.result?.summary?.attemptSummary || {};
  const skipped = job.result?.skippedActions || job.skippedActions || [];
  const unsafeActionsSkipped = skipped.filter(
    (item) => item.safetyLevel === 'unsafe-skipped' || item.safetyLevel === 'requires-confirmation'
  ).length;

  return {
    pagesDiscovered: job.result?.pagesDiscovered ?? job.totalPagesDiscovered ?? 0,
    pagesSelected: job.result?.pagesSelected ?? job.totalPagesDiscovered ?? 0,
    pagesAnalyzed: job.pagesAnalyzed ?? job.result?.pagesAnalyzed?.length ?? 0,
    clickCandidates: attempt.clickCandidates ?? 0,
    hoverCandidates: attempt.hoverCandidates ?? 0,
    formCandidates: attempt.formCandidates ?? 0,
    selectCandidates: attempt.selectCandidates ?? 0,
    checkboxCandidates: attempt.checkboxCandidates ?? 0,
    radioCandidates: attempt.radioCandidates ?? 0,
    keyboardCandidates: attempt.keyboardCandidates ?? 0,
    navigationCandidates: attempt.navigationCandidates ?? 0,
    totalCandidates: attempt.totalCandidates ?? job.totalActionsFound ?? 0,
    actionsProbed: job.actionsProbed ?? 0,
    hoverActionsProbed: job.hoverActionsProbed ?? 0,
    clickActionsProbed: job.clickActionsProbed ?? 0,
    suggestionsFound: job.suggestionsFound ?? 0,
    unsafeActionsSkipped,
    // Legacy fields used by existing UI
    totalPagesDiscovered: job.totalPagesDiscovered ?? job.result?.pagesSelected ?? 0,
    totalActionsFound: job.totalActionsFound ?? attempt.totalCandidates ?? 0,
  };
}

function formatAnalyzerJobResponse(job) {
  if (!job) return null;
  const base = formatJobResponse(job);
  return {
    ...base,
    stats: buildAnalyzerStats(job),
    attemptSummary: job.result?.attemptSummary || job.result?.summary?.attemptSummary || null,
  };
}

function createAnalyzerJob(payload) {
  const options = resolveAnalyzerOptions(payload);
  if (!options.url || typeof options.url !== 'string') {
    throw new Error('URL is required.');
  }

  return createDiscoveryJob({
    url: options.url.trim(),
    maxPages: options.maxPages,
    maxActions: options.maxActions,
    maxDepth: options.maxDepth,
    includeSubpages: options.includeSubpages,
    mode: options.mode,
    depth: options.depth,
  });
}

function getAnalyzerJobStatus(id) {
  return formatAnalyzerJobResponse(jobRepository.getJobById(id));
}

function getAnalyzerJobResult(id) {
  const result = getJobResult(id);
  if (!result) return null;
  const job = jobRepository.getJobById(id);
  return {
    ...result,
    stats: job ? buildAnalyzerStats(job) : undefined,
    attemptSummary: result.attemptSummary || result.summary?.attemptSummary || null,
  };
}

function cancelAnalyzerJob(id) {
  return formatAnalyzerJobResponse(cancelJob(id));
}

module.exports = {
  createAnalyzerJob,
  getAnalyzerJobStatus,
  getAnalyzerJobResult,
  cancelAnalyzerJob,
  formatAnalyzerJobResponse,
  buildAnalyzerStats,
  resolveAnalyzerOptions,
};
