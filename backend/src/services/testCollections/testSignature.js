const crypto = require('crypto');
const { normalizeCollectionUrl } = require('./normalizeCollectionUrl');

function stepsShape(steps = []) {
  return steps
    .filter((step) => step.action !== 'screenshot')
    .map((step) => `${step.action}:${step.label || ''}:${step.selector || step.text || step.value || ''}`)
    .join('|');
}

function buildTestSignature({
  sourceUrl,
  type = 'flow',
  primaryLabel = '',
  selectorOrLabel = '',
  steps = [],
  patternType = '',
}) {
  let normalizedSource = sourceUrl;
  try {
    normalizedSource = normalizeCollectionUrl(sourceUrl).sourceUrl;
  } catch {
    // keep raw
  }

  const payload = JSON.stringify({
    sourceUrl: normalizedSource,
    type,
    patternType,
    primaryLabel: String(primaryLabel).trim().toLowerCase(),
    selectorOrLabel: String(selectorOrLabel).trim().toLowerCase(),
    stepsShape: stepsShape(steps),
  });

  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

module.exports = {
  buildTestSignature,
  stepsShape,
};
