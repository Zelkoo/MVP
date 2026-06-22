const express = require('express');
const scenarioRepository = require('../services/scenarioRepository');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid scenario run ID.' });
    }

    const run = scenarioRepository.getScenarioRunById(id);
    if (!run) {
      return res.status(404).json({ error: 'Scenario run not found.' });
    }

    res.json(run);
  })
);

module.exports = router;
