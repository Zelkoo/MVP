const express = require('express');
const { dryRunAnalyzeFlow } = require('../services/scenarios/dryRunAnalyzer');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.post(
  '/dry-run-analyze',
  asyncHandler(async (req, res) => {
    const { startUrl, steps, viewport } = req.body || {};

    const validation = await validateUrl(startUrl);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'At least one step is required.' });
    }

    const result = await dryRunAnalyzeFlow({
      startUrl: validation.url,
      steps,
      viewport,
    });

    res.json(result);
  })
);

module.exports = router;
