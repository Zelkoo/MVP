const express = require('express');
const scenarioRepository = require('../services/scenarioRepository');
const monitoringRepository = require('../services/monitoring/monitoringRepository');
const { runScenario, isValidScenarioType, normalizeConfig } = require('../services/scenarios');
const { computeTestReliability } = require('../services/scenarios/testReliabilityScore');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, type, startUrl, config, collectionId, sourceUrl, generatedBy, testSignature, metadata } =
      req.body || {};

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Scenario name is required.' });
    }

    if (!isValidScenarioType(type)) {
      return res.status(400).json({ error: 'Invalid scenario type.' });
    }

    const validation = await validateUrl(startUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const scenario = scenarioRepository.createScenario({
      name: name.trim(),
      type,
      startUrl: validation.url,
      config: normalizeConfig(type, config, validation.url),
      collectionId: collectionId ? parseInt(collectionId, 10) : null,
      sourceUrl: sourceUrl || validation.url,
      generatedBy: generatedBy || 'manual',
      testSignature: testSignature || null,
      metadata: metadata || {},
    });

    return res.status(201).json(scenario);
  })
);

router.get(
  '/',
  asyncHandler((req, res) => {
    res.json(scenarioRepository.getAllScenarios());
  })
);

router.post(
  '/reliability-score',
  asyncHandler(async (req, res) => {
    const { type = 'flow', startUrl = '', config = {}, steps = null } = req.body || {};

    if (type !== 'flow' && !isValidScenarioType(type)) {
      return res.status(400).json({ error: 'Invalid scenario type.' });
    }

    if (type === 'flow' && !steps && !config?.steps) {
      return res.status(400).json({ error: 'Flow reliability scoring requires steps.' });
    }

    let normalizedConfig = config;
    if (type === 'flow' && !steps) {
      try {
        normalizedConfig = normalizeConfig('flow', config, startUrl);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    const result = computeTestReliability({
      type,
      startUrl,
      config: normalizedConfig,
      steps,
    });

    return res.json(result);
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid scenario ID.' });
    }

    const scenario = scenarioRepository.getScenarioById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }

    res.json(scenario);
  })
);

router.delete(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid scenario ID.' });
    }

    const scenario = scenarioRepository.getScenarioById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }

    const hadMonitoringFlow = monitoringRepository.hasMonitoringFlowMatchingScenario(scenario);
    const deleted = scenarioRepository.deleteScenario(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }

    const response = { success: true, deleted: true };
    if (hadMonitoringFlow) {
      response.warning =
        'This saved test was deleted, but monitored flows created from it remain unchanged.';
    }

    res.json(response);
  })
);

router.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid scenario ID.' });
    }

    const scenario = scenarioRepository.getScenarioById(id);
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }

    const validation = await validateUrl(scenario.startUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    try {
      const recordVideo = req.body?.recordVideo !== false;
      const runScenarioPayload = recordVideo
        ? { ...scenario, config: { ...scenario.config, recordVideo: true } }
        : scenario;
      const outcome = await runScenario(runScenarioPayload);
      const run = scenarioRepository.createScenarioRun(scenario.id, outcome);
      return res.status(201).json(run);
    } catch (error) {
      console.error('Scenario run failed:', error.message);
      const run = scenarioRepository.createScenarioRun(scenario.id, {
        status: 'error',
        score: 0,
        screenshotPath: null,
        result: {
          steps: [{ name: 'Run scenario', status: 'failed', message: error.message }],
          issues: [
            {
              type: 'validation',
              severity: 'critical',
              message: 'Scenario run error',
              details: error.message,
              recommendation: 'Review scenario configuration and try again.',
            },
          ],
          consoleErrors: [],
          summary: `Scenario run error: ${error.message}`,
        },
      });

      return res.status(500).json({ ...run, error: error.message });
    }
  })
);

module.exports = router;
