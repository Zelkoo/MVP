const jobRepository = require('./discoveryJobRepository');

class DiscoveryCancelledError extends Error {
  constructor(message = 'Discovery cancelled.') {
    super(message);
    this.name = 'DiscoveryCancelledError';
  }
}

function calculatePageProgress(pageIndex, totalPages) {
  if (!totalPages || totalPages <= 0) return 35;
  const slice = 40;
  const start = 30;
  return Math.min(70, start + Math.round(((pageIndex + 1) / totalPages) * slice));
}

function createProgressReporter(jobId) {
  let partialState = {
    partialSuggestions: [],
    pagesAnalyzed: [],
    skippedActions: [],
    pagesFailed: [],
    warnings: [],
  };

  function currentJob() {
    return jobRepository.getJobById(jobId);
  }

  function isCancelled() {
    const job = currentJob();
    return job?.status === 'cancelled';
  }

  function throwIfCancelled() {
    if (isCancelled()) {
      throw new DiscoveryCancelledError();
    }
  }

  function mergePartial(patch = {}) {
    partialState = {
      ...partialState,
      partialSuggestions: patch.partialSuggestions || partialState.partialSuggestions,
      pagesAnalyzed: patch.pagesAnalyzed || partialState.pagesAnalyzed,
      skippedActions: patch.skippedActions || partialState.skippedActions,
      pagesFailed: patch.pagesFailed || partialState.pagesFailed,
      warnings: patch.warnings || partialState.warnings,
    };
    return partialState;
  }

  async function persist(stage, message, patch = {}) {
    throwIfCancelled();

    const job = currentJob();
    if (!job) return null;

    if (patch.partialResult) {
      mergePartial(patch.partialResult);
    }

    const warnings =
      patch.warnings !== undefined
        ? patch.warnings
        : partialState.warnings.length
          ? partialState.warnings
          : job.warnings;

    return jobRepository.updateJob(jobId, {
      status: 'running',
      currentStage: stage,
      currentMessage: message,
      progressPercent: patch.progressPercent ?? job.progressPercent,
      collectionId: patch.collectionId ?? job.collectionId,
      totalPagesDiscovered: patch.totalPagesDiscovered ?? patch.pagesSelected ?? job.totalPagesDiscovered,
      pagesAnalyzed: patch.pagesAnalyzed ?? job.pagesAnalyzed,
      totalActionsFound: patch.totalActionsFound ?? job.totalActionsFound,
      actionsProbed: patch.actionsProbed ?? job.actionsProbed,
      hoverActionsProbed: patch.hoverActionsProbed ?? job.hoverActionsProbed,
      clickActionsProbed: patch.clickActionsProbed ?? job.clickActionsProbed,
      suggestionsFound: patch.suggestionsFound ?? job.suggestionsFound,
      warnings,
      result: {
        ...(job.result || {}),
        ...partialState,
        partialSuggestions: partialState.partialSuggestions,
        attemptSummary: patch.partialResult?.attemptSummary || job.result?.attemptSummary || null,
        pagesDiscovered: patch.pagesDiscovered ?? job.result?.pagesDiscovered,
        pagesSelected: patch.pagesSelected ?? job.result?.pagesSelected,
      },
    });
  }

  return {
    jobId,
    isCancelled,
    throwIfCancelled,
    calculatePageProgress,
    getPartialState: () => ({ ...partialState }),

    async start(stage, message, patch = {}) {
      return persist(stage, message, { progressPercent: patch.progressPercent ?? 3, ...patch });
    },

    async update(stage, message, patch = {}) {
      return persist(stage, message, patch);
    },

    async increment(field, amount = 1, patch = {}) {
      const job = currentJob();
      if (!job) return null;
      const map = {
        pagesAnalyzed: 'pagesAnalyzed',
        actionsProbed: 'actionsProbed',
        hoverActionsProbed: 'hoverActionsProbed',
        clickActionsProbed: 'clickActionsProbed',
        suggestionsFound: 'suggestionsFound',
        totalActionsFound: 'totalActionsFound',
      };
      const key = map[field] || field;
      const current = job[key] || 0;
      return persist(job.currentStage || stageFromField(field), job.currentMessage, {
        [key]: current + amount,
        ...patch,
      });
    },

    async warning(type, message) {
      partialState.warnings.push({ type, message });
      const job = currentJob();
      return persist(job?.currentStage || 'running', job?.currentMessage || message, {
        warnings: [...(job?.warnings || []), { type, message }],
      });
    },

    async setPartialResult(partialResult) {
      mergePartial(partialResult);
      const job = currentJob();
      return persist(job?.currentStage || 'running', job?.currentMessage || 'Updating progress…', {
        partialResult,
        suggestionsFound: partialResult.partialSuggestions?.length ?? job?.suggestionsFound,
      });
    },

    async complete(result) {
      const now = new Date().toISOString();
      return jobRepository.updateJob(jobId, {
        status: 'completed',
        progressPercent: 100,
        currentStage: 'completed',
        currentMessage: `Discovery complete — found ${result.summary?.suggestionsFound || result.suggestions?.length || 0} possible tests.`,
        collectionId: result.collection?.id ?? null,
        totalPagesDiscovered: result.pagesSelected ?? result.pagesAnalyzed?.length ?? 0,
        pagesAnalyzed: result.pagesAnalyzed?.length ?? 0,
        suggestionsFound: result.suggestions?.length ?? 0,
        warnings: result.warnings || [],
        finishedAt: now,
        result: {
          ...result,
          partialSuggestions: result.suggestions || [],
          attemptSummary: result.attemptSummary || result.summary?.attemptSummary,
          pagesDiscovered: result.pagesDiscovered,
          pagesSelected: result.pagesSelected,
        },
      });
    },

    async fail(errorMessage, partialResult = {}) {
      const now = new Date().toISOString();
      mergePartial(partialResult);
      const suggestions = partialResult.partialSuggestions || partialState.partialSuggestions || [];
      return jobRepository.updateJob(jobId, {
        status: suggestions.length > 0 ? 'partial' : 'failed',
        progressPercent: currentJob()?.progressPercent || 0,
        currentStage: suggestions.length > 0 ? 'partial' : 'failed',
        currentMessage: errorMessage,
        errorMessage,
        suggestionsFound: suggestions.length,
        finishedAt: now,
        result: {
          ...partialResult,
          ...partialState,
          partialSuggestions: suggestions,
          errorMessage,
        },
      });
    },

    async cancel(partialResult = {}) {
      const now = new Date().toISOString();
      mergePartial(partialResult);
      return jobRepository.updateJob(jobId, {
        status: 'cancelled',
        currentStage: 'cancelled',
        currentMessage: 'Discovery cancelled.',
        finishedAt: now,
        result: {
          ...partialResult,
          ...partialState,
        },
      });
    },
  };
}

function stageFromField(field) {
  if (field.includes('hover')) return 'probing-hover-actions';
  if (field.includes('click')) return 'probing-click-actions';
  if (field.includes('suggestions')) return 'generating-suggestions';
  return 'probing-click-actions';
}

module.exports = {
  createProgressReporter,
  DiscoveryCancelledError,
  calculatePageProgress,
};
