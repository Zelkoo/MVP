const express = require('express');
const scanRepository = require('../services/scanRepository');
const { asyncHandler } = require('../utils/asyncHandler');
const { isValidPublicToken } = require('../utils/token');

const router = express.Router();

router.get(
  '/:token',
  asyncHandler((req, res) => {
    const { token } = req.params;

    if (!isValidPublicToken(token)) {
      return res.status(400).json({ error: 'Invalid report token.' });
    }

    const report = scanRepository.getPublicReportByToken(token);
    if (!report) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    res.json(report);
  })
);

module.exports = router;
