const express = require('express');
const {
  createAnalyzerJob,
  getAnalyzerJobStatus,
  getAnalyzerJobResult,
  cancelAnalyzerJob,
} = require('../services/analyzer/analyzerJobService');
const { DEPTH_PRESETS } = require('../services/analyzer/analyzerConfig');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/depth-presets',
  asyncHandler((req, res) => {
    res.json(DEPTH_PRESETS);
  })
);

router.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const {
      url,
      mode = 'safe',
      depth = 'standard',
      includeSubpages,
      maxPages,
      maxActionsPerPage,
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      const job = createAnalyzerJob({
        url: url.trim(),
        mode,
        depth,
        includeSubpages,
        maxPages,
        maxActionsPerPage,
      });
      res.status(202).json(job);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  })
);

router.get(
  '/jobs/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid job ID.' });
    }

    const job = getAnalyzerJobStatus(id);
    if (!job) {
      return res.status(404).json({ error: 'Analyzer job not found.' });
    }

    res.json(job);
  })
);

router.get(
  '/jobs/:id/result',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid job ID.' });
    }

    const result = getAnalyzerJobResult(id);
    if (!result) {
      return res.status(404).json({ error: 'Analyzer job not found.' });
    }

    if (!result.ready) {
      return res.status(202).json(result);
    }

    res.json(result);
  })
);

router.post(
  '/jobs/:id/cancel',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid job ID.' });
    }

    const job = cancelAnalyzerJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Analyzer job not found.' });
    }

    res.json(job);
  })
);

module.exports = router;
