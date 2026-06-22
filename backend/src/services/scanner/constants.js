const config = require('../../config');

const GLOBAL_SCAN_TIMEOUT_MS = config.scanTimeoutMs;
const NAVIGATION_TIMEOUT_MS = config.navigationTimeoutMs;
const LINK_CHECK_TIMEOUT_MS = 10000;
const MAX_LINKS_TO_CHECK = config.maxLinksToCheck;const MAX_CRAWL_PAGES = 5;
const SCREENSHOT_TIMEOUT_MS = 10000;

class ScanTimeoutError extends Error {
  constructor(message = 'Global scan timeout exceeded') {
    super(message);
    this.name = 'ScanTimeoutError';
  }
}

module.exports = {
  GLOBAL_SCAN_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
  LINK_CHECK_TIMEOUT_MS,
  MAX_LINKS_TO_CHECK,
  MAX_CRAWL_PAGES,
  SCREENSHOT_TIMEOUT_MS,
  ScanTimeoutError,
};
