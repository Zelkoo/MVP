const { captureScreenshot } = require('../scenarios/base');

function estimateChangedRegion(beforeState, afterState, diff) {
  const boxes = [];

  for (const element of diff?.newElements || []) {
    if (element.boundingBox) boxes.push(element.boundingBox);
  }
  for (const element of diff?.revealedElements || []) {
    if (element.boundingBox) boxes.push(element.boundingBox);
  }
  for (const change of diff?.changes || []) {
    if (change.element?.boundingBox) boxes.push(change.element.boundingBox);
  }

  if (boxes.length === 0) {
    const afterTextLen = (afterState?.visibleTextSample || '').length;
    const beforeTextLen = (beforeState?.visibleTextSample || '').length;
    if (afterTextLen > beforeTextLen + 10) {
      return null;
    }
    return null;
  }

  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));

  return {
    x: Math.max(0, minX),
    y: Math.max(0, minY),
    width: Math.max(40, maxX - minX),
    height: Math.max(24, maxY - minY),
  };
}

function summarizeVisualChange(behavior, diff) {
  if (behavior?.type === 'hover-reveal') {
    return 'Hidden content became visible after hover.';
  }
  if (behavior?.type === 'navigation') {
    return 'Page navigated to a new destination.';
  }
  if (behavior?.type === 'modal-open-close') {
    return 'A dialog or modal appeared after the interaction.';
  }
  if (behavior?.type === 'dynamic-loading') {
    return 'Loading finished and final content became visible.';
  }
  const first = diff?.changes?.[0]?.description;
  return first || behavior?.summary || 'Page state changed after the interaction.';
}

async function captureVisualEvidence(page, beforeState, afterState, diff, behavior, label = 'probe') {
  try {
    const safeLabel = `${label}-${behavior?.type || 'change'}`.replace(/[^a-z0-9-]/gi, '-').slice(0, 48);
    const afterScreenshotPath = await captureScreenshot(page, `${safeLabel}-after`);
    return {
      beforeScreenshotPath: null,
      afterScreenshotPath,
      changedRegion: estimateChangedRegion(beforeState, afterState, diff),
      summary: summarizeVisualChange(behavior, diff),
    };
  } catch {
    return null;
  }
}

async function captureBeforeScreenshot(page, label = 'probe') {
  try {
    return await captureScreenshot(page, `${label}-before`.replace(/[^a-z0-9-]/gi, '-').slice(0, 48));
  } catch {
    return null;
  }
}

module.exports = {
  captureVisualEvidence,
  captureBeforeScreenshot,
  estimateChangedRegion,
  summarizeVisualChange,
};
