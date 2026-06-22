const express = require('express');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');
const { inspectPage } = require('../services/pageInspector');

const router = express.Router();

router.post(
  '/inspect',
  asyncHandler(async (req, res) => {
    const { url, viewport = 'desktop' } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required.' });
    }

    const validation = await validateUrl(url.trim());
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (viewport !== 'desktop' && viewport !== 'mobile') {
      return res.status(400).json({ error: 'Viewport must be "desktop" or "mobile".' });
    }

    const result = await inspectPage(validation.url, viewport);
    res.json(result);
  })
);

module.exports = router;
