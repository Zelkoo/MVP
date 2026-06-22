const express = require('express');
const monitoringRepository = require('../services/monitoring/monitoringRepository');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid run ID.' });
    }

    const run = monitoringRepository.getFlowRunById(id);
    if (!run) {
      return res.status(404).json({ error: 'Flow run not found.' });
    }

    res.json(run);
  })
);

module.exports = router;
