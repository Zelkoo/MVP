const path = require('path');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '../data'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'),
  screenshotsDir:
    process.env.SCREENSHOTS_DIR ||
    path.join(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'), 'screenshots'),
  videosDir:
    process.env.VIDEOS_DIR ||
    path.join(process.env.UPLOADS_DIR || path.join(__dirname, '../uploads'), 'videos'),
  scanTimeoutMs: parseInt(process.env.SCAN_TIMEOUT_MS || '90000', 10),
  navigationTimeoutMs: parseInt(process.env.NAVIGATION_TIMEOUT_MS || '20000', 10),
  maxLinksToCheck: parseInt(process.env.MAX_LINKS_TO_CHECK || '30', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4200',
};
