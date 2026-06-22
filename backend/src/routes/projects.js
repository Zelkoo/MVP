const express = require('express');
const monitoringRepository = require('../services/monitoring/monitoringRepository');
const { getClientReport } = require('../services/monitoring/monitoringClientReport');
const { asyncHandler } = require('../utils/asyncHandler');
const router = express.Router();

router.get(
  '/',
  asyncHandler((req, res) => {
    const projects = monitoringRepository.getAllProjects().map((project) => ({
      ...project,
      stats: monitoringRepository.getProjectStats(project.id),
    }));
    res.json(projects);
  })
);

router.post(
  '/',
  asyncHandler((req, res) => {
    const { name, domain } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Project name is required.' });
    }
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Project domain is required.' });
    }

    const project = monitoringRepository.createProject({ name, domain });
    return res.status(201).json({
      ...project,
      stats: monitoringRepository.getProjectStats(project.id),
    });
  })
);

router.get(
  '/:id/client-report',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const report = getClientReport(id, limit);
    if (!report) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.json(report);
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid project ID.' });
    }

    const project = monitoringRepository.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const flows = monitoringRepository.getFlowsByProjectId(id).map((flow) => ({
      ...flow,
      stats: monitoringRepository.getFlowStats(flow.id),
    }));

    res.json({
      ...project,
      stats: monitoringRepository.getProjectStats(id),
      flows,
    });
  })
);

module.exports = router;
