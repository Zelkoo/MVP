const { withInspectorBrowser } = require('../pageInspector/browserContext');
const { loadPageForInspection } = require('../pageInspector/loadPage');
const { capturePageState } = require('./pageStateSnapshot');
const { diffPageStates, hasMeaningfulChange } = require('./pageStateDiff');
const { classifyActionSafety } = require('./safeActionClassifier');
const { findCandidateActions, emptyCounts } = require('./candidateActionFinder');
const { classifyBehavior, upgradeToRemovableBehavior, isInteractiveElement } = require('./behaviorClassifier');
const { generateTestSuggestion, detectLoginFormSuggestion } = require('./testSuggestionGenerator');
const { probeDynamicLoading, isLikelyDynamicLoadCandidate } = require('./dynamicLoadingProbe');
const { captureVisualEvidence, captureBeforeScreenshot } = require('./visualEvidence');
const { DiscoveryCancelledError } = require('./discoveryProgress');
const { navigateWithSlashFallback } = require('../pageInspector/resolvePageUrl');

const STABILIZATION_MS = 1200;
const HOVER_STABILIZATION_MS = 900;
const DEFAULT_MAX_ACTIONS = 20;

function dummyValueForInput(element) {
  switch (element.type) {
    case 'email':
      return 'test@example.com';
    case 'tel':
      return '555-0100';
    case 'url':
      return 'https://example.com';
    case 'number':
      return '42';
    case 'search':
      return 'test query';
    case 'password':
      return 'test-password';
    case 'color':
      return '#336699';
    case 'date':
      return '2024-06-01';
    case 'time':
      return '12:30';
    case 'datetime-local':
      return '2024-06-01T12:30';
    case 'month':
      return '2024-06';
    case 'week':
      return '2024-W01';
    case 'range':
      return '50';
    default:
      return 'test-input-value';
  }
}

async function resolveCandidateLocator(page, element, candidate) {
  const selectors = [element.selector, ...(element.selectorAlternatives || [])].filter(Boolean);
  for (const selector of selectors) {
    try {
      if (selector.includes('>> nth=')) {
        const [base, nthPart] = selector.split('>> nth=');
        const locator = page.locator(base.trim()).nth(parseInt(nthPart, 10));
        await locator.waitFor({ state: 'visible', timeout: 3000 });
        return locator;
      }
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: 3000 });
      return locator;
    } catch {
      continue;
    }
  }
  throw new Error(`Could not locate ${candidate.humanLabel}`);
}

function probeStageForCandidate(candidate) {
  switch (candidate.actionType) {
    case 'hover':
      return 'probing-hover-actions';
    case 'select':
      return 'probing-form-controls';
    case 'fill':
    case 'press':
      return 'probing-form-controls';
    case 'navigate':
      return 'probing-click-actions';
    default:
      return 'probing-click-actions';
  }
}

async function hoverCandidate(page, candidate) {
  const element = candidate.element;
  const selectors = [element.selector, ...(element.selectorAlternatives || [])].filter(Boolean);

  for (const selector of selectors) {
    try {
      if (selector.includes('>> nth=')) {
        const [base, nthPart] = selector.split('>> nth=');
        await page.locator(base.trim()).nth(parseInt(nthPart, 10)).hover({ timeout: 4000 });
        return;
      }
      await page.locator(selector).first().hover({ timeout: 4000 });
      return;
    } catch {
      continue;
    }
  }

  if (element.boundingBox?.width && element.boundingBox?.height) {
    const { x, y, width, height } = element.boundingBox;
    await page.mouse.move(x + width / 2, y + height / 2);
    return;
  }

  throw new Error(`Could not hover ${candidate.humanLabel}`);
}

async function executeCandidateAction(page, candidate) {
  const element = candidate.element;
  const fillValue = dummyValueForInput(element);

  if (candidate.actionType === 'select') {
    const optionsList = await page.evaluate((selector) => {
      const select = document.querySelector(selector);
      if (!select) return [];
      return Array.from(select.options).map((option) => ({
        value: option.value,
        text: option.textContent.trim(),
      }));
    }, element.selector);
    const currentValue = await page.$eval(element.selector, (select) => select.value).catch(() => '');
    const nextOption = optionsList.find((option) => option.value && option.value !== currentValue);
    if (!nextOption) throw new Error('No alternate dropdown option available.');
    await page.selectOption(element.selector, nextOption.value);
    return nextOption;
  }

  if (candidate.actionType === 'fill') {
    const locator = await resolveCandidateLocator(page, element, candidate);
    await locator.fill(fillValue);
    return null;
  }

  if (candidate.actionType === 'press') {
    const locator = await resolveCandidateLocator(page, element, candidate);
    await locator.fill('');
    await locator.type('test', { delay: 40 });
    return null;
  }

  if (candidate.actionType === 'hover') {
    await hoverCandidate(page, candidate);
    return null;
  }

  if (candidate.actionType === 'check' || candidate.actionType === 'uncheck') {
    const locator = await resolveCandidateLocator(page, element, candidate);
    await locator.click();
    return null;
  }

  const locator = await resolveCandidateLocator(page, element, candidate);
  await locator.click();
  return null;
}

async function reloadPage(page, pageUrl) {
  await navigateWithSlashFallback(page, pageUrl, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function probeRemovableBehavior(page, baseBehavior) {
  const created = (baseBehavior.createdElements || []).filter(isInteractiveElement);
  if (created.length === 0) return null;

  for (const generatedElement of created.slice(0, 3)) {
    const beforeRemove = await capturePageState(page);
    try {
      await executeCandidateAction(page, {
        element: generatedElement,
        humanLabel: generatedElement.humanLabel || generatedElement.text || 'generated control',
        actionType: 'click',
      });
      await page.waitForTimeout(STABILIZATION_MS);
      const afterRemove = await capturePageState(page);
      const removeDiff = diffPageStates(beforeRemove, afterRemove);
      const upgraded = upgradeToRemovableBehavior(baseBehavior, generatedElement, removeDiff);
      if (upgraded) return upgraded;

      await reloadPage(page, baseBehavior.before.url);
      const refreshed = await capturePageState(page);
      const creator = refreshed.elements.find((el) => el.signature === baseBehavior.action.element.signature);
      if (!creator) continue;
      await executeCandidateAction(page, { ...baseBehavior.action, element: creator });
      await page.waitForTimeout(STABILIZATION_MS);
    } catch {
      continue;
    }
  }

  return null;
}

function incrementProbeStats(stats, candidate) {
  stats.actionsProbed += 1;
  if (candidate.actionType === 'hover') stats.hoverActionsProbed += 1;
  else if (['click', 'check', 'uncheck', 'navigate'].includes(candidate.actionType)) stats.clickActionsProbed += 1;
}

async function explorePageBehavior(pageUrl, options = {}) {
  const mode = options.mode || 'safe';
  const viewport = options.viewport || { width: 1440, height: 900 };
  const maxActions = Math.min(options.maxActions || DEFAULT_MAX_ACTIONS, 30);
  const suggestions = [];
  const discoveredBehaviors = [];
  const skippedActions = [];
  const warnings = [];
  let pageTitle = null;
  let pageStateForIntent = null;
  let status = 'ok';
  const stats = {
    totalActionsFound: 0,
    actionsProbed: 0,
    hoverActionsProbed: 0,
    clickActionsProbed: 0,
    suggestionsFound: 0,
    candidateCounts: emptyCounts(),
    attemptSummary: emptyCounts(),
  };

  await withInspectorBrowser({ viewport }, async (context) => {
    const page = await context.newPage();
    let resolvedPageUrl = pageUrl;
    try {
      const loaded = await loadPageForInspection(page, pageUrl);
      resolvedPageUrl = loaded.finalUrl || pageUrl;

      if (loaded.status === 'blocked' || loaded.status === 'error') {
        status = loaded.status;
        warnings.push(...(loaded.warnings || []));
        return;
      }

      if (loaded.status === 'timeout' || loaded.status === 'partial') {
        status = loaded.status === 'timeout' ? 'partial' : loaded.status;
        warnings.push(
          ...(loaded.warnings || []).filter(
            (warning) =>
              warning.type !== 'timeout' &&
              !/could not detect useful interactive elements/i.test(warning.message || '')
          )
        );
      }

      const initialState = await capturePageState(page);
      pageTitle = initialState.title;
      pageStateForIntent = initialState;

      const loginSuggestion = detectLoginFormSuggestion(resolvedPageUrl, pageTitle, initialState);
      if (loginSuggestion && mode === 'safe') {
        suggestions.push(loginSuggestion);
      }

      const { candidates, counts } = findCandidateActions(initialState);
      stats.totalActionsFound = candidates.length;
      stats.candidateCounts = counts;
      stats.attemptSummary = { ...counts };

      const maxHover = Math.min(counts.hoverCandidates, Math.max(3, Math.ceil(maxActions / 2)));
      let hoverProbed = 0;
      let probesRun = 0;

      if (options.progress) {
        await options.progress.update(
          'inspecting-elements',
          `Found ${counts.totalCandidates} candidates (${counts.hoverCandidates} hover, ${counts.clickCandidates} click, ${counts.formCandidates} form, ${counts.selectCandidates} select)`,
          { totalActionsFound: counts.totalCandidates }
        );
      }

      for (const candidate of candidates) {
        if (options.progress?.isCancelled?.()) {
          throw new DiscoveryCancelledError();
        }
        if (probesRun >= maxActions) break;
        if (candidate.actionType === 'hover' && hoverProbed >= maxHover) continue;

        const safety = classifyActionSafety(candidate.element, { actionType: candidate.actionType });
        if (mode === 'safe' && (safety.safetyLevel === 'unsafe-skipped' || safety.safetyLevel === 'requires-confirmation')) {
          skippedActions.push({
            label: candidate.humanLabel,
            actionType: candidate.actionType,
            safetyLevel: safety.safetyLevel,
            reason: safety.reason,
          });
          continue;
        }

        await reloadPage(page, resolvedPageUrl);
        const before = await capturePageState(page);
        const beforeScreenshotPath = await captureBeforeScreenshot(page, `probe-${candidate.actionType}`);
        const liveCandidate = before.elements.find((el) => el.signature === candidate.element.signature);
        if (!liveCandidate) continue;

        const probeStage = probeStageForCandidate(candidate);
        const probeStats = { ...stats, suggestionsFound: suggestions.length };
        if (options.onProbeStart) {
          await options.onProbeStart(candidate, probeStats);
        } else if (options.progress) {
          await options.progress.update(
            probeStage,
            `Probing ${candidate.actionType} on ${candidate.humanLabel || 'interaction'}…`,
            probeStats
          );
        }

        try {
          let behavior = null;
          let after = before;
          let diff = { changes: [] };

          if (isLikelyDynamicLoadCandidate(candidate)) {
            const dynamicProbe = await probeDynamicLoading(page, candidate, async (probePage, probeCandidate) => {
              await executeCandidateAction(probePage, { ...probeCandidate, element: liveCandidate });
            });
            if (dynamicProbe) {
              after = dynamicProbe.after;
              diff = dynamicProbe.diff;
              behavior = classifyBehavior({
                action: { ...candidate, element: liveCandidate },
                before: dynamicProbe.before,
                after,
                diff,
                safety,
                dynamicLoading: dynamicProbe,
              });
            }
          }

          if (!behavior) {
            const selectMeta = await executeCandidateAction(page, { ...candidate, element: liveCandidate });
            const waitMs = candidate.actionType === 'hover' ? HOVER_STABILIZATION_MS : STABILIZATION_MS;
            await page.waitForTimeout(waitMs);
            after = await capturePageState(page);
            diff = diffPageStates(before, after);

            if (!hasMeaningfulChange(diff)) continue;

            if (selectMeta && diff.changes.every((change) => change.type !== 'select-value-changed')) {
              diff.changes.push({
                type: 'select-value-changed',
                description: `Select value changed to "${selectMeta.value}".`,
                element: liveCandidate,
                afterValue: selectMeta.value,
                confidence: 0.86,
              });
            }

            behavior = classifyBehavior({
              action: { ...candidate, element: liveCandidate },
              before,
              after,
              diff,
              safety,
            });
          }

          if (!behavior) continue;

          if (behavior.type === 'dynamic-element-created') {
            const removable = await probeRemovableBehavior(page, behavior);
            if (removable) behavior = removable;
          }

          const visualEvidence = await captureVisualEvidence(page, before, after, diff, behavior, candidate.actionType);
          if (visualEvidence && beforeScreenshotPath) {
            visualEvidence.beforeScreenshotPath = beforeScreenshotPath;
          }
          behavior.visualEvidence = visualEvidence;
          behavior.sourceUrl = resolvedPageUrl;
          if (behavior.type === 'navigation') {
            behavior.destinationUrl = after.url;
          }
          if (behavior.type === 'hover-reveal') {
            behavior.revealedElement =
              diff.revealedElements?.[0] || diff.changes.find((c) => c.element)?.element || null;
          }

          discoveredBehaviors.push(behavior);
          const suggestion = generateTestSuggestion(behavior, resolvedPageUrl, pageTitle);
          suggestions.push(suggestion);
          probesRun += 1;
          if (candidate.actionType === 'hover') hoverProbed += 1;
          incrementProbeStats(stats, candidate);
          stats.suggestionsFound = suggestions.length;

          if (options.progress) {
            await options.progress.update(
              'diffing-page-state',
              `Detected ${behavior.type} after "${candidate.humanLabel}"`,
              { ...stats, suggestionsFound: suggestions.length }
            );
          }
        } catch (error) {
          skippedActions.push({
            label: candidate.humanLabel,
            actionType: candidate.actionType,
            safetyLevel: 'unsafe-skipped',
            reason: error.message,
          });
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  });

  const unique = [];
  const seen = new Set();
  for (const suggestion of suggestions) {
    const key = `${suggestion.patternType}|${suggestion.sourceUrl}|${suggestion.primaryLabel}|${suggestion.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }

  unique.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return {
    suggestions: unique,
    discoveredBehaviors,
    skippedActions,
    warnings,
    pageTitle,
    status,
    stats,
    pageState: pageStateForIntent,
  };
}

module.exports = {
  explorePageBehavior,
  probePageActions: explorePageBehavior,
};
