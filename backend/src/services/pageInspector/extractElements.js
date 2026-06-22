const { generateBestSelector, getElementLabel, suggestActionTypes } = require('./selectorHelpers');
const { classifyElement, importanceRank } = require('./classifyElement');

const EXTRACT_SCRIPT = () => {
  const selectors = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[onclick]',
    '[data-testid]',
    '[data-test]',
    '[data-cy]',
    '[aria-label]',
  ].join(',');

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  function visibleText(el) {
    const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 120);
  }

  function isVisible(el, rect) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > viewportHeight) return false;
    if (rect.right < 0 || rect.left > viewportWidth) return false;
    return true;
  }

  function looksDynamicClass(className) {
    if (!className) return true;
    if (/^[a-z]{1,3}\d{4,}$/i.test(className)) return true;
    if (/^(css-|jsx-|sc-|emotion-|svelte-|ng-|_)/i.test(className)) return true;
    if (/^[a-f0-9]{6,}$/i.test(className)) return true;
    return false;
  }

  const nodes = Array.from(document.querySelectorAll(selectors));
  const raw = [];

  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;

    const tagName = el.tagName.toLowerCase();
    const classList = Array.from(el.classList || []).filter((name) => !looksDynamicClass(name)).slice(0, 3);

    raw.push({
      tagName,
      text: visibleText(el),
      role: el.getAttribute('role') || '',
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      href: el.getAttribute('href') || '',
      testId: el.getAttribute('data-testid') || '',
      dataTest: el.getAttribute('data-test') || '',
      dataCy: el.getAttribute('data-cy') || '',
      stableClasses: classList,
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  return raw;
};

function scoreElement(element) {
  const tag = (element.tagName || '').toLowerCase();
  let score = element.confidence || 0.5;

  if (tag === 'button' || tag === 'a') score += 0.15;
  if (tag === 'input' || tag === 'textarea') score += 0.12;
  if (element.testId || element.dataTest || element.dataCy) score += 0.2;
  if (element.text) score += 0.08;
  if (element.boundingBox?.height >= 28 && element.boundingBox?.width >= 40) score += 0.05;

  return score;
}

function dedupeElements(elements) {
  const seen = new Set();
  const result = [];

  for (const element of elements) {
    const box = element.boundingBox;
    const key = `${element.selector}|${box.x}|${box.y}|${box.width}|${box.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(element);
  }

  return result;
}

function buildElements(rawElements, limit = 100, context = {}) {
  const enriched = rawElements.map((raw, index) => {
    const { selector, alternatives, confidence } = generateBestSelector(raw);
    const label = getElementLabel(raw);
    const classification = classifyElement(raw, {
      label,
      viewportHeight: context.viewportHeight || 900,
    });

    return {
      id: `el-${index}`,
      tagName: raw.tagName,
      text: raw.text || '',
      role: raw.role || null,
      type: raw.type || null,
      selector,
      selectorAlternatives: alternatives,
      actionTypeSuggestions: suggestActionTypes(raw),
      isVisible: true,
      boundingBox: raw.boundingBox,
      confidence,
      label,
      category: classification.category,
      importance: classification.importance,
      humanLabel: classification.humanLabel,
      businessMeaning: classification.businessMeaning,
      suggestedActions: classification.suggestedActions,
      explanation: classification.explanation,
      _score: 0,
      _importanceRank: classification.importanceRank,
    };
  });

  for (const element of enriched) {
    element._score = scoreElement(element) + element._importanceRank * 0.35;
  }

  enriched.sort((a, b) => b._score - a._score);

  return dedupeElements(enriched)
    .slice(0, limit)
    .map(({ _score, _importanceRank, ...element }) => element);
}

async function extractInteractiveElements(page, limit = 100) {
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  const rawElements = await page.evaluate(EXTRACT_SCRIPT);
  return buildElements(rawElements, limit, { viewportHeight: viewport.height });
}

module.exports = {
  extractInteractiveElements,
  buildElements,
};
