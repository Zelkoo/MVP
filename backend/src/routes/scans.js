const express = require('express');
const scanRepository = require('../services/scanRepository');
const { runScan } = require('../services/scanner');
const { validateUrl } = require('../utils/urlValidator');
const { asyncHandler } = require('../utils/asyncHandler');
const { enrichIssues, computeScore, buildSummary } = require('../utils/scanMetrics');

const router = express.Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { url } = req.body || {};
    const validation = await validateUrl(url);

    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
        issues: [
          {
            type: 'validation',
            severity: 'critical',
            message: validation.error,
            details: typeof url === 'string' ? url : null,
            source: 'url-validator',
          },
        ],
      });
    }

    try {
      const scanResult = await runScan(validation.url);
      const saved = scanRepository.createScan(scanResult, scanResult.issues || []);
      return res.status(201).json(saved);
    } catch (error) {
      console.error('Scan failed:', error.message);

      const failedIssues = enrichIssues([
        {
          type: 'validation',
          severity: 'critical',
          message: 'Scan failed',
          details: error.message,
          source: 'scanner',
        },
      ]);
      const failedScore = computeScore(failedIssues);

      const failedScan = scanRepository.createScan(
        {
          url: validation.url,
          finalUrl: validation.url,
          title: null,
          statusCode: null,
          loadDurationMs: null,
          totalRequests: 0,
          failedRequestsCount: 0,
          desktopScreenshotPath: null,
          mobileScreenshotPath: null,
          summary: buildSummary(failedIssues, failedScore),
          score: failedScore,
          status: 'failed',
        },
        failedIssues
      );

      return res.status(500).json({
        ...failedScan,
        error: error.message,
      });
    }
  })
);

router.get(
  '/',
  asyncHandler((req, res) => {
    const scans = scanRepository.getAllScans();
    res.json(scans);
  })
);

router.get(
  '/:id',
  asyncHandler((req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid scan ID.' });
    }

    const scan = scanRepository.getScanById(id);
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found.' });
    }
    res.json(scan);
  })
);

module.exports = router;
