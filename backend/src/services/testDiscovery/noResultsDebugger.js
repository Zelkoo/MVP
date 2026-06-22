function buildNoResultsReport(context = {}) {
  const {
    pagesAnalyzed = [],
    attemptSummary = {},
    skippedActions = [],
    aggregateStats = {},
    suggestions = [],
    allowedRiskLevel = 'safe',
  } = context;

  const reasons = [];
  const attempted = {
    pagesAnalyzed: pagesAnalyzed.length,
    clickCandidates: attemptSummary.clickCandidates || 0,
    hoverCandidates: attemptSummary.hoverCandidates || 0,
    formCandidates: attemptSummary.formCandidates || 0,
    selectCandidates: attemptSummary.selectCandidates || 0,
    checkboxCandidates:
      (attemptSummary.checkboxCandidates || 0) + (attemptSummary.radioCandidates || 0),
    actionsProbed: aggregateStats.actionsProbed || 0,
  };

  const hoverSkippedNoReveal = skippedActions.filter(
    (item) => item.actionType === 'hover' && item.reason?.includes('did not reveal')
  );
  const requiresConfirmation = skippedActions.filter(
    (item) => item.safetyLevel === 'requires-confirmation'
  );
  const unsafeSkipped = skippedActions.filter((item) => item.safetyLevel === 'unsafe-skipped');

  if (attempted.hoverCandidates > 0 && aggregateStats.hoverActionsProbed === 0) {
    reasons.push('Hover candidates were found but none produced reliable visible changes when probed.');
  } else if (attempted.hoverCandidates > 0 && suggestions.every((s) => s.type !== 'hover-reveal')) {
    reasons.push('Hover candidates did not reveal visible content worth turning into a safe test.');
  }

  if (requiresConfirmation.length > 0) {
    reasons.push(
      `${requiresConfirmation.length} candidate action(s) looked like real submissions and require confirmation before testing.`
    );
  }

  if (unsafeSkipped.length > 0) {
    reasons.push(`${unsafeSkipped.length} candidate action(s) were skipped for safety.`);
  }

  if (attempted.actionsProbed === 0 && attempted.clickCandidates + attempted.hoverCandidates > 0) {
    reasons.push('Interactions were found, but none produced a reliable safe behavior change.');
  }

  if (pagesAnalyzed.some((page) => page.status === 'error')) {
    reasons.push('Some pages could not be fully analyzed.');
  }

  if (reasons.length === 0) {
    reasons.push('The site did not expose stable safe interactions during this analysis pass.');
  }

  const nextSteps = [];
  if (requiresConfirmation.length > 0 && allowedRiskLevel !== 'requires-confirmation') {
    nextSteps.push('Enable form validation or login tests that require confirmation.');
  }
  if (attempted.actionsProbed < 10) {
    nextSteps.push('Increase max actions per page.');
  }
  if (pagesAnalyzed.length <= 1) {
    nextSteps.push('Try Deep analysis with subpages enabled.');
  }
  nextSteps.push('Use the visual picker or advanced builder for custom flows.');

  return {
    summary: 'No reliable safe test suggestions were found.',
    attempted,
    reasons,
    nextSteps,
  };
}

module.exports = {
  buildNoResultsReport,
};
