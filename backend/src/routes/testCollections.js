const express = require('express');
const collectionRepository = require('../services/testCollections/collectionRepository');
const collectionService = require('../services/testCollections/collectionService');
const collectionRunService = require('../services/testCollections/collectionRunService');
const {
  getCollectionAnalyzerSettings,
  saveCollectionAnalyzerSettings,
} = require('../services/testCollections/collectionAnalyzerSettings');
const scenarioRepository = require('../services/scenarioRepository');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler((req, res) => {
    res.json(collectionRepository.getAllCollections());
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, domain, origin, startUrl, description } = req.body || {};
    if (!name || !domain || !origin || !startUrl) {
      return res.status(400).json({ error: 'Name, domain, origin, and start URL are required.' });
    }

    const validation = await validateUrl(startUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const collection = collectionRepository.createCollection({
      name: name.trim(),
      domain: domain.trim(),
      origin: origin.trim(),
      startUrl: validation.url,
      description: description || null,
    });

    res.status(201).json({
      ...collection,
      ...collectionRepository.getCollectionStats(collection.id),
    });
  })
);

router.get(
  '/runs/:runId',
  asyncHandler((req, res) => {
    const runId = parseInt(req.params.runId, 10);
    if (Number.isNaN(runId) || runId < 1) {
      return res.status(400).json({ error: 'Invalid collection run ID.' });
    }

    const run = collectionRunService.getCollectionRun(runId);
    if (!run) {
      return res.status(404).json({ error: 'Collection run not found.' });
    }

    res.json(collectionRunService.formatRunProgress(run));
  })
);

router.post(
  '/runs/:runId/cancel',
  asyncHandler((req, res) => {
    const runId = parseInt(req.params.runId, 10);
    if (Number.isNaN(runId) || runId < 1) {
      return res.status(400).json({ error: 'Invalid collection run ID.' });
    }

    try {
      const run = collectionRunService.cancelCollectionRun(runId);
      res.json(collectionRunService.formatRunProgress(run));
    } catch (error) {
      return res.status(error.message === 'Collection run not found.' ? 404 : 400).json({ error: error.message });
    }
  })
);

router.post(
  '/from-url',
  asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: 'URL is required.' });
    }

    try {
      const collection = await collectionService.getOrCreateFromUrl(url);
      res.json(collection);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    const detail = collectionService.getCollectionDetail(id);
    if (!detail) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    res.json(detail);
  })
);

router.patch(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    const collection = collectionRepository.updateCollection(id, req.body || {});
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    res.json({ ...collection, ...collectionRepository.getCollectionStats(id) });
  })
);

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    const collection = collectionRepository.getCollectionById(id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    const deleteTests = req.query.deleteTests === 'true';
    if (deleteTests) {
      collectionRepository.softDeleteCollectionAndAllTests(id);
    } else {
      collectionRepository.softDeleteCollection(id);
    }

    res.json({ success: true });
  })
);

router.post(
  '/:id/run-all',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    try {
      const recordVideo = req.body?.recordVideo === true;
      const summary = await collectionService.runAllTests(id, { recordVideo });
      res.status(201).json(summary);
    } catch (error) {
      if (error.message === 'Collection not found.') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message || 'Failed to run collection tests.' });
    }
  })
);

router.delete(
  '/:id/tests',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    try {
      const result = collectionService.deleteAllTestsInCollection(id);
      res.json({ success: true, ...result });
    } catch (error) {
      if (error.message === 'Collection not found.') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message || 'Failed to delete tests.' });
    }
  })
);

router.delete(
  '/:id/tests/batch',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    const scenarioIds = req.body?.scenarioIds || [];
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }
    if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return res.status(400).json({ error: 'scenarioIds array is required.' });
    }
    try {
      const result = collectionService.deleteSelectedTests(id, scenarioIds);
      res.json({ success: true, ...result });
    } catch (error) {
      return res.status(error.message === 'Collection not found.' ? 404 : 500).json({ error: error.message });
    }
  })
);

router.get(
  '/:id/runs',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    const collection = collectionRepository.getCollectionById(id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const runs = collectionRunService.getCollectionRuns(id, limit).map((run) =>
      collectionRunService.formatRunProgress(run)
    );
    res.json(runs);
  })
);

router.post(
  '/:id/run-selected',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    const scenarioIds = req.body?.scenarioIds || [];
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }
    if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return res.status(400).json({ error: 'scenarioIds array is required.' });
    }
    try {
      const run = collectionService.runSelectedTests(id, scenarioIds, {
        parallelism: req.body?.parallelism,
      });
      res.status(202).json({
        runId: run.id,
        run: collectionRunService.formatRunProgress(run),
      });
    } catch (error) {
      return res.status(error.message === 'Collection not found.' ? 404 : 400).json({ error: error.message });
    }
  })
);

router.post(
  '/:id/monitor-selected',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const scenarioIds = req.body?.scenarioIds || [];
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }
    if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return res.status(400).json({ error: 'scenarioIds array is required.' });
    }
    try {
      const result = await collectionService.monitorSelectedTests(id, scenarioIds, {
        schedule: req.body?.schedule || 'daily',
        alertEmail: req.body?.alertEmail || '',
        runNow: req.body?.runNow === true,
        alertOnFailure: req.body?.alertOnFailure !== false,
        alertOnRecovery: req.body?.alertOnRecovery !== false,
        failureThreshold: req.body?.failureThreshold,
      });
      res.status(201).json(result);
    } catch (error) {
      return res.status(error.message === 'Collection not found.' ? 404 : 500).json({ error: error.message });
    }
  })
);

router.get(
  '/:id/analyzer-settings',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid collection ID.' });
    res.json(getCollectionAnalyzerSettings(id));
  })
);

router.patch(
  '/:id/analyzer-settings',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid collection ID.' });
    try {
      const saved = saveCollectionAnalyzerSettings(id, req.body || {});
      res.json(saved.metadata?.analyzerSettings || getCollectionAnalyzerSettings(id));
    } catch (error) {
      return res.status(error.message === 'Collection not found.' ? 404 : 500).json({ error: error.message });
    }
  })
);

router.get(
  '/:id/analyzer-comparison',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) return res.status(400).json({ error: 'Invalid collection ID.' });
    const comparison = collectionService.getAnalyzerComparison(id);
    if (!comparison) return res.status(404).json({ error: 'Not enough analyzer history to compare.' });
    res.json(comparison);
  })
);

router.post(
  '/:id/tag-tests',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    const scenarioIds = req.body?.scenarioIds || [];
    const tag = req.body?.tag || '';
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }
    if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return res.status(400).json({ error: 'scenarioIds array is required.' });
    }
    try {
      collectionService.tagSelectedTests(id, scenarioIds, tag);
      res.json({ success: true });
    } catch (error) {
      return res.status(error.message === 'Collection not found.' ? 404 : 400).json({ error: error.message });
    }
  })
);

router.post(
  '/:id/add-suggestions',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid collection ID.' });
    }

    const { suggestions = [], replace = false } = req.body || {};
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ error: 'Suggestions array is required.' });
    }

    const collection = collectionRepository.getCollectionById(id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found.' });
    }

    const results = collectionService.bulkAddSuggestions(id, suggestions, { replace });
    res.json({
      added: results.created.length,
      skipped: results.skipped.length,
      errorCount: results.errors.length,
      created: results.created,
      skippedItems: results.skipped,
      errorItems: results.errors,
      message: `Added ${results.created.length} tests to ${collection.name}. ${results.skipped.length} already existed and were skipped.`,
    });
  })
);

module.exports = router;
