const { chromium } = require('playwright');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function withInspectorBrowser(options, run) {
  let browser = null;
  let context = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    context = await browser.newContext({
      viewport: options.viewport || { width: 1440, height: 900 },
      userAgent: options.userAgent || DEFAULT_USER_AGENT,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
    });

    return await run(context);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = {
  withInspectorBrowser,
  DEFAULT_USER_AGENT,
};
