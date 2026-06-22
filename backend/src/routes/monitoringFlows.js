const express = require('express');
const monitoringRepository = require('../services/monitoring/monitoringRepository');
const scenarioRepository = require('../services/scenarioRepository');
const { runFlowAndRecord } = require('../services/monitoring/scheduler');
const { executeMonitoringFlow } = require('../services/monitoring/flowExecutor');
const { isValidSchedule, SCHEDULES } = require('../services/monitoring/scheduleUtils');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');
const { computeTestReliability } = require('../services/scenarios/testReliabilityScore');

const router = express.Router();

router.get(
  '/schedules',
  asyncHandler((req, res) => {
    res.json(SCHEDULES);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { projectId, name, startUrl, steps, successConditions, schedule, isActive, scenarioId } =
      req.body || {};

    if (!projectId || Number.isNaN(parseInt(projectId, 10))) {
      return res.status(400).json({ error: 'Project ID is required.' });
    }

    const project = monitoringRepository.getProjectById(parseInt(projectId, 10));
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (scenarioId) {
      const scenario = scenarioRepository.getScenarioById(parseInt(scenarioId, 10));
      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found.' });
      }
      const flow = monitoringRepository.createFlowFromScenario(project.id, scenario);
      return res.status(201).json({
        ...flow,
        stats: monitoringRepository.getFlowStats(flow.id),
        reliability: computeTestReliability({
          type: 'flow',
          startUrl: flow.startUrl,
          steps: [...flow.steps, ...flow.successConditions],
        }),
      });
    }

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Flow name is required.' });
    }

    const validation = await validateUrl(startUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (schedule && !isValidSchedule(schedule)) {
      return res.status(400).json({ error: 'Invalid schedule.' });
    }

    const flow = monitoringRepository.createFlow({
      projectId: project.id,
      name,
      startUrl: validation.url,
      steps: steps || [],
      successConditions: successConditions || [],
      schedule: schedule || 'manual',
      isActive: isActive !== false,
    });

    return res.status(201).json({
      ...flow,
      stats: monitoringRepository.getFlowStats(flow.id),
      reliability: computeTestReliability({
        type: 'flow',
        startUrl: flow.startUrl,
        steps: [...flow.steps, ...flow.successConditions],
      }),
    });
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid flow ID.' });
    }

    const flow = monitoringRepository.getFlowById(id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found.' });
    }

    const project = monitoringRepository.getProjectById(flow.projectId);
    const stats = monitoringRepository.getFlowStats(id);
    const recentRuns = monitoringRepository.getFlowRuns(id, 20);
    const failedRuns = recentRuns.filter((run) => run.status !== 'passed').slice(0, 10);

    res.json({
      ...flow,
      project,
      stats,
      recentRuns,
      failedRuns,
      reliability: computeTestReliability({
        type: 'flow',
        startUrl: flow.startUrl,
        steps: [...flow.steps, ...flow.successConditions],
      }),
    });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid flow ID.' });
    }

    const existing = monitoringRepository.getFlowById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Flow not found.' });
    }

    const patch = req.body || {};
    if (patch.schedule && !isValidSchedule(patch.schedule)) {
      return res.status(400).json({ error: 'Invalid schedule.' });
    }

    if (patch.startUrl) {
      const validation = await validateUrl(patch.startUrl);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      patch.startUrl = validation.url;
    }

    if (patch.failureThreshold !== undefined) {
      const threshold = parseInt(patch.failureThreshold, 10);
      if (Number.isNaN(threshold) || threshold < 1) {
        return res.status(400).json({ error: 'failureThreshold must be at least 1.' });
      }
      patch.failureThreshold = threshold;
    }

    const flow = monitoringRepository.updateFlow(id, patch);
    res.json({
      ...flow,
      stats: monitoringRepository.getFlowStats(id),
      reliability: computeTestReliability({
        type: 'flow',
        startUrl: flow.startUrl,
        steps: [...flow.steps, ...flow.successConditions],
      }),
    });
  })
);

router.get(
  '/:id/runs',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid flow ID.' });
    }

    const flow = monitoringRepository.getFlowById(id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found.' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    res.json(monitoringRepository.getFlowRuns(id, limit));
  })
);

router.post(
  '/:id/run',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid flow ID.' });
    }

    const flow = monitoringRepository.getFlowById(id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found.' });
    }

    const run = await runFlowAndRecord(flow);
    const reliability = computeTestReliability({
      type: 'flow',
      startUrl: flow.startUrl,
      steps: [...flow.steps, ...flow.successConditions],
    });

    return res.status(201).json({
      ...run,
      stats: monitoringRepository.getFlowStats(id),
      reliability,
    });
  })
);

router.post(
  '/:id/preview-run',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid flow ID.' });
    }

    const flow = monitoringRepository.getFlowById(id);
    if (!flow) {
      return res.status(404).json({ error: 'Flow not found.' });
    }

    const outcome = await executeMonitoringFlow(flow);
    res.json(outcome);
  })
);

module.exports = router;
