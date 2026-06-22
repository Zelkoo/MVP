const { withInspectorBrowser } = require('./browserContext');
const { loadPageForInspection } = require('./loadPage');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

async function inspectPage(url, viewportName = 'desktop') {
  const viewport = VIEWPORTS[viewportName] || VIEWPORTS.desktop;

  return withInspectorBrowser({ viewport }, async (context) => {
    const page = await context.newPage();

    try {
      const result = await loadPageForInspection(page, url);

      return {
        url,
        finalUrl: result.finalUrl,
        title: result.title,
        screenshotPath: result.screenshotPath,
        viewport,
        elements: result.elements,
        status: result.status,
        warnings: result.warnings,
        timing: result.timing,
      };
    } finally {
      await page.close().catch(() => {});
    }
  });
}

module.exports = {
  inspectPage,
  VIEWPORTS,
  loadPageForInspection,
  withInspectorBrowser,
};
