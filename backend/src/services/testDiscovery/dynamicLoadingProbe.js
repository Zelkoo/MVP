const { capturePageState } = require('./pageStateSnapshot');
const { diffPageStates } = require('./pageStateDiff');

const LOADING_TEXT = /\b(loading|please wait|spinner|processing|starting|fetching)\b/i;
const START_LABEL = /\b(start|load|begin|fetch|run|go)\b/i;

function countLoadingSignals(state) {
  const text = `${state.visibleTextSample || ''} ${(state.headings || []).join(' ')}`.toLowerCase();
  let count = state.loadingIndicatorCount || 0;
  if (LOADING_TEXT.test(text)) count += 1;
  if (state.documentBusy) count += 1;
  return count;
}

function isLikelyDynamicLoadCandidate(candidate) {
  const label = `${candidate.humanLabel || ''} ${candidate.element?.text || ''}`.toLowerCase();
  return candidate.actionType === 'click' && START_LABEL.test(label);
}

async function probeDynamicLoading(page, candidate, executeAction) {
  if (!isLikelyDynamicLoadCandidate(candidate)) {
    return null;
  }

  const before = await capturePageState(page);
  await executeAction(page, candidate);
  const immediate = await capturePageState(page);
  await page.waitForTimeout(700);
  const intermediate = await capturePageState(page);

  let final = intermediate;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    final = await capturePageState(page);
    const loadingNow = countLoadingSignals(final);
    const loadingBefore = countLoadingSignals(intermediate);
    const gainedText = (final.visibleTextSample || '').length > (before.visibleTextSample || '').length + 12;
    const newElements = final.elementCount > before.elementCount + 2;
    if (loadingNow === 0 && loadingBefore > 0 && (gainedText || newElements)) {
      break;
    }
    if (loadingNow === 0 && gainedText && Date.now() - deadline > -3000) {
      break;
    }
  }

  const immediateDiff = diffPageStates(before, immediate);
  const finalDiff = diffPageStates(before, final);
  const loadingAppeared =
    countLoadingSignals(immediate) > countLoadingSignals(before) ||
    countLoadingSignals(intermediate) > countLoadingSignals(before);
  const loadingFinished = countLoadingSignals(final) < countLoadingSignals(intermediate);
  const finalContentAppeared =
    (final.visibleTextSample || '').length > (before.visibleTextSample || '').length + 15 ||
    final.elementCount > before.elementCount + 1;

  if ((loadingAppeared && loadingFinished && finalContentAppeared) || (loadingAppeared && finalContentAppeared)) {
    const finalText =
      final.visibleTexts?.find((text) => text.length >= 4 && !LOADING_TEXT.test(text)) ||
      final.visibleTexts?.[0] ||
      null;
    return {
      before,
      after: final,
      diff: finalDiff,
      immediateDiff,
      finalText,
      reasoning: [
        'A start/load style control was clicked.',
        loadingAppeared ? 'A loading phase was observed.' : 'Content changed after a short wait.',
        finalContentAppeared ? 'Final content appeared after loading.' : 'Page state stabilized after interaction.',
      ],
    };
  }

  if (
    finalDiff.changes.length > 0 &&
    START_LABEL.test(candidate.humanLabel || '') &&
    finalContentAppeared
  ) {
    return {
      before,
      after: final,
      diff: finalDiff,
      immediateDiff,
      finalText:
        final.visibleTexts?.find((text) => text.length >= 4 && !LOADING_TEXT.test(text)) ||
        final.visibleTexts?.[0] ||
        null,
      reasoning: [
        'Clicking the control changed page content after a delay.',
        'Observed delayed content update consistent with dynamic loading.',
      ],
    };
  }

  return null;
}

module.exports = {
  probeDynamicLoading,
  isLikelyDynamicLoadCandidate,
  countLoadingSignals,
};
