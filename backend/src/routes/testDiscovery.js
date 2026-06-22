const express = require('express');
const { analyzeDiscovery, discoverBehavior } = require('../services/testDiscovery/discoveryService');
const {
  createDiscoveryJob,
  getJobStatus,
  getJobResult,
  cancelJob,
} = require('../services/testDiscovery/discoveryJobService');
const collectionService = require('../services/testCollections/collectionService');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.post(
  '/jobs',
  asyncHandler(async (req, res) => {
    const { url, maxPages = 5, maxActions = 20, maxDepth = 1, includeSubpages = true, mode = 'safe' } =
      req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      const job = createDiscoveryJob({
        url: url.trim(),
        maxPages,
        maxActions,
        maxDepth,
        includeSubpages,
        mode,
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

    const job = getJobStatus(id);
    if (!job) {
      return res.status(404).json({ error: 'Discovery job not found.' });
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

    const result = getJobResult(id);
    if (!result) {
      return res.status(404).json({ error: 'Discovery job not found.' });
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

    const job = cancelJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Discovery job not found.' });
    }

    res.json(job);
  })
);

router.post(
  '/discover',
  asyncHandler(async (req, res) => {
    const {
      url,
      maxActions = 20,
      maxDepth = 1,
      maxPages,
      includeSubpages = true,
      mode = 'safe',
    } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      const result = await discoverBehavior({
        url: url.trim(),
        maxActions: Math.min(parseInt(maxActions, 10) || 20, 30),
        maxDepth: Math.min(parseInt(maxDepth, 10) || 1, 3),
        maxPages: maxPages != null ? Math.min(parseInt(maxPages, 10) || 5, 15) : undefined,
        includeSubpages: includeSubpages !== false,
        mode: mode === 'full' ? 'full' : 'safe',
      });
      res.json(result);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  })
);

router.post(
  '/analyze',
  asyncHandler(async (req, res) => {
    const { url, maxPages = 10, mode = 'safe' } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      const result = await analyzeDiscovery({
        url: url.trim(),
        maxPages: Math.min(parseInt(maxPages, 10) || 5, 15),
        mode: mode === 'full' ? 'full' : 'safe',
      });
      res.json(result);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  })
);

router.post(
  '/analyze-and-save',
  asyncHandler(async (req, res) => {
    const { url, maxPages = 10, mode = 'safe', saveSafeOnly = true } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    const result = await analyzeDiscovery({
      url: url.trim(),
      maxPages: Math.min(parseInt(maxPages, 10) || 10, 15),
      mode: mode === 'full' ? 'full' : 'safe',
    });

    const toSave = saveSafeOnly
      ? result.suggestions.filter(
          (s) => s.safetyLevel === 'safe' || s.safetyLevel === 'safe-generated-element'
        )
      : result.suggestions;

    const bulk = collectionService.bulkAddSuggestions(result.collection.id, toSave);

    res.json({
      ...result,
      saveResult: {
        added: bulk.created.length,
        skipped: bulk.skipped.length,
        message: `Added ${bulk.created.length} tests to ${result.collection.name}. ${bulk.skipped.length} already existed and were skipped.`,
      },
    });
  })
);

module.exports = router;
