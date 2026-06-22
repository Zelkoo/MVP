const {
  inspectPage,
  VIEWPORTS,
  loadPageForInspection,
  withInspectorBrowser,
} = require('../pageInspector');
const { extractPageContext } = require('./extractPageContext');
const { buildSuggestions } = require('./buildSuggestions');

function mergeWarnings(primary = [], extra = []) {
  const all = [...primary, ...extra];
  return all.map((entry) =>
    typeof entry === 'string' ? { type: 'info', message: entry } : entry
  );
}

async function analyzePage(url, viewportName = 'desktop', options = {}) {
  const viewport = VIEWPORTS[viewportName] || VIEWPORTS.desktop;
  const skipMobile = options.skipMobile === true;

  const desktop = await withInspectorBrowser({ viewport }, async (context) => {
    const page = await context.newPage();
    try {
      const loaded = await loadPageForInspection(page, url);
      const pageContext =
        loaded.status === 'error' ? { forms: [], interactive: [] } : await extractPageContext(page);

      return {
        ...loaded,
        url,
        viewport,
        pageContext,
      };
    } finally {
      await page.close().catch(() => {});
    }
  });

  let mobileInteractive = null;
  const mobileWarnings = [];

  if (desktop.status !== 'error' && !skipMobile) {
    try {
      mobileInteractive = await withInspectorBrowser({ viewport: VIEWPORTS.mobile }, async (context) => {
        const page = await context.newPage();
        try {
          const loaded = await loadPageForInspection(page, url);
          if (loaded.status === 'blocked') {
            mobileWarnings.push({
              type: 'bot-protection',
              message: 'Mobile viewport also hit a browser verification screen.',
            });
            return null;
          }
          const pageContext = await extractPageContext(page);
          return pageContext.interactive;
        } finally {
          await page.close().catch(() => {});
        }
      });
    } catch {
      mobileWarnings.push({
        type: 'info',
        message: 'Mobile menu analysis could not be completed.',
      });
    }
  }

  const suggestions =
    desktop.status === 'blocked'
      ? []
      : buildSuggestions({
          forms: desktop.pageContext.forms,
          interactive: desktop.pageContext.interactive,
          url,
          viewportHeight: viewport.height,
          mobileInteractive,
        });

  const extraWarnings = [];
  if (suggestions.length === 0 && desktop.status === 'ok') {
    extraWarnings.push({
      type: 'low-content',
      message: 'No strong business-flow patterns were detected. Try the advanced builder or pick elements manually.',
    });
  }

  return {
    url: desktop.url,
    finalUrl: desktop.finalUrl,
    title: desktop.title,
    screenshotPath: desktop.screenshotPath,
    viewport: desktop.viewport,
    elements: desktop.elements,
    status: desktop.status,
    timing: desktop.timing,
    suggestions,
    warnings: mergeWarnings(desktop.warnings, [...mobileWarnings, ...extraWarnings]),
  };
}

module.exports = {
  analyzePage,
};
