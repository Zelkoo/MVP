const fs = require('fs');
const path = require('path');
const { SCREENSHOT_TIMEOUT_MS } = require('./constants');

async function safeScreenshot(page, filePath, options = {}) {
  try {
    await page.screenshot({
      path: filePath,
      fullPage: false,
      timeout: SCREENSHOT_TIMEOUT_MS,
      ...options,
    });
    return { captured: true, error: null };
  } catch (error) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { captured: false, error: error.message };
  }
}

async function captureScreenshots(page, screenshotsDir, timestamp) {
  const desktopFilename = `desktop-${timestamp}.png`;
  const mobileFilename = `mobile-${timestamp}.png`;
  const desktopPath = path.join(screenshotsDir, desktopFilename);
  const mobilePath = path.join(screenshotsDir, mobileFilename);

  const desktopResult = await safeScreenshot(page, desktopPath);
  await page.setViewportSize({ width: 390, height: 844 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
  const mobileResult = await safeScreenshot(page, mobilePath);

  return {
    desktop: {
      path: desktopResult.captured ? `/uploads/screenshots/${desktopFilename}` : null,
      captured: desktopResult.captured,
      error: desktopResult.error,
    },
    mobile: {
      path: mobileResult.captured ? `/uploads/screenshots/${mobileFilename}` : null,
      captured: mobileResult.captured,
      error: mobileResult.error,
    },
  };
}

module.exports = { captureScreenshots };
