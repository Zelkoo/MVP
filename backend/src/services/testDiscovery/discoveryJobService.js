const jobRepository = require('./discoveryJobRepository');
const collectionRepository = require('../testCollections/collectionRepository');
const { createProgressReporter, DiscoveryCancelledError } = require('./discoveryProgress');
const { discoverBehavior } = require('./discoveryService');

function formatJobResponse(job) {
  if (!job) return null;

  const collection = job.collectionId
    ? {
        ...collectionRepository.getCollectionById(job.collectionId),
        ...collectionRepository.getCollectionStats(job.collectionId),
      }
    : job.result?.collection || null;

  return {
    id: job.id,
    jobId: job.id,
    status: job.status,
    progressPercent: job.progressPercent,
    currentStage: job.currentStage,
    currentMessage: job.currentMessage,
    url: job.url,
    collection,
    stats: {
      totalPagesDiscovered: job.totalPagesDiscovered,
      pagesAnalyzed: job.pagesAnalyzed,
      totalActionsFound: job.totalActionsFound,
      actionsProbed: job.actionsProbed,
      hoverActionsProbed: job.hoverActionsProbed,
      clickActionsProbed: job.clickActionsProbed,
      suggestionsFound: job.suggestionsFound,
    },
    warnings: job.warnings,
    partialSuggestions: job.partialSuggestions || job.result?.partialSuggestions || [],
    pagesFailed: job.pagesFailed || job.result?.pagesFailed || [],
    skippedActions: job.skippedActions || job.result?.skippedActions || [],
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

async function executeJob(jobId) {
  jobRepository.markRunning(jobId);
  const job = jobRepository.getJobById(jobId);
  if (!job) return;

  const progress = createProgressReporter(jobId);
  const request = job.request || {};

  try {
    await progress.start('queued', 'Starting discovery…', { progressPercent: 2 });
    const result = await discoverBehavior({
      url: job.url,
      ...request,
      progress,
    });
    await progress.complete(result);
  } catch (error) {
    if (error.name === 'DiscoveryCancelledError') {
      await progress.cancel(progress.getPartialState());
      return;
    }
    await progress.fail(error.message || 'Discovery failed.', progress.getPartialState());
  }
}

function createDiscoveryJob(payload) {
  const {
    url,
    maxPages = 5,
    maxActions = 20,
    maxDepth = 1,
    includeSubpages = true,
    mode = 'safe',
  } = payload;

  if (!url || typeof url !== 'string') {
    throw new Error('URL is required.');
  }

  const job = jobRepository.createJob({
    url: url.trim(),
    request: {
      maxPages: Math.min(parseInt(maxPages, 10) || 5, 25),
      maxActions: Math.min(parseInt(maxActions, 10) || 20, 50),
      maxDepth: Math.min(parseInt(maxDepth, 10) || 1, 3),
      includeSubpages: includeSubpages !== false,
      mode: mode === 'full' ? 'full' : 'safe',
    },
  });

  setImmediate(() => {
    executeJob(job.id).catch((error) => {
      console.error(`Discovery job ${job.id} failed:`, error.message);
    });
  });

  return { jobId: job.id, id: job.id, status: 'queued' };
}

function getJobStatus(id) {
  return formatJobResponse(jobRepository.getJobById(id));
}

function getJobResult(id) {
  const job = jobRepository.getJobById(id);
  if (!job) return null;

  if (!['completed', 'partial', 'cancelled', 'failed'].includes(job.status)) {
    return { ready: false, status: job.status };
  }

  if (job.result?.suggestions) {
    return { ready: true, status: job.status, ...job.result };
  }

  const partial = job.result?.partialSuggestions || job.partialSuggestions || [];
  return {
    ready: true,
    status: job.status,
    url: job.url,
    collection: job.result?.collection || null,
    pagesAnalyzed: job.result?.pagesAnalyzed || [],
    suggestions: partial,
    groupedSuggestions: job.result?.groupedSuggestions || [],
    skippedActions: job.result?.skippedActions || job.skippedActions || [],
    warnings: job.warnings || [],
    pagesFailed: job.result?.pagesFailed || [],
    partialSuggestions: partial,
    errorMessage: job.errorMessage,
    summary: job.result?.summary || {
      pagesAnalyzed: job.pagesAnalyzed,
      suggestionsFound: partial.length,
      safeSuggestions: partial.filter(
        (s) => s.safetyLevel === 'safe' || s.safetyLevel === 'safe-generated-element'
      ).length,
    },
  };
}

function cancelJob(id) {
  const job = jobRepository.getJobById(id);
  if (!job) return null;
  if (!['queued', 'running'].includes(job.status)) {
    return formatJobResponse(job);
  }
  jobRepository.markCancelled(id);
  return formatJobResponse(jobRepository.getJobById(id));
}

module.exports = {
  createDiscoveryJob,
  getJobStatus,
  getJobResult,
  cancelJob,
  executeJob,
  formatJobResponse,
};
