function createStepId() {
  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSuccessStrategies(steps) {
  const expectStep = steps.find((step) => step.type === 'expect-success');
  return expectStep?.successStrategies || [];
}

function findDetectedElement(suggestion, step) {
  if (step.selector) {
    const bySelector = suggestion.detectedElements?.find(
      (entry) =>
        entry.selector === step.selector ||
        entry.alternatives?.includes(step.selector) ||
        step.selector === entry.alternatives?.[0]
    );
    if (bySelector) return bySelector;
  }
  if (step.elementLabel) {
    return suggestion.detectedElements?.find((entry) => entry.label === step.elementLabel);
  }
  return undefined;
}

function targetMetadata(suggestion, step) {
  const detected = findDetectedElement(suggestion, step);
  const primarySelector =
    step.selector && !step.selector.startsWith('text=')
      ? step.selector
      : detected?.selector || step.selector;
  const alternatives = (detected?.alternatives || []).filter(
    (candidate) => candidate && candidate !== primarySelector
  );
  const text =
    step.text ||
    (step.selector?.startsWith('text=') ? step.selector.replace(/^text=/, '') : undefined);

  return {
    selector: primarySelector,
    selectorAlternatives: alternatives.length ? alternatives : undefined,
    targetText: text,
    targetRole: detected?.ariaRole || undefined,
    targetLabel: step.elementLabel || detected?.label,
    text,
  };
}

function convertSuccessStrategy(suggestion, strategy) {
  switch (strategy.type) {
    case 'page-contains-text':
      return [
        {
          id: createStepId(),
          action: 'waitForText',
          label: 'Check success message',
          text: strategy.value || 'thank',
          timeoutMs: 8000,
        },
      ];
    case 'url-changed':
      return [
        {
          id: createStepId(),
          action: 'expectUrlContains',
          label: 'Check URL changed',
          value: strategy.value || '/',
        },
      ];
    case 'network-2xx-after-submit':
      return [
        {
          id: createStepId(),
          action: 'expectNetworkSuccess',
          label: 'Check successful server response',
          value: strategy.value || undefined,
          timeoutMs: 8000,
        },
      ];
    case 'element-visible': {
      const detected = suggestion.detectedElements?.find(
        (entry) =>
          entry.selector === strategy.value ||
          entry.label === strategy.elementLabel ||
          entry.alternatives?.includes(strategy.value || '')
      );
      return [
        {
          id: createStepId(),
          action: 'expectVisible',
          label: `Check ${strategy.elementLabel || 'element'} is visible`,
          selector: strategy.value || detected?.selector || '',
          elementLabel: strategy.elementLabel || detected?.label,
          selectorAlternatives: detected?.alternatives?.filter((alt) => alt !== strategy.value),
          targetRole: detected?.ariaRole,
          targetLabel: strategy.elementLabel || detected?.label,
          targetText: detected?.label,
        },
      ];
    }
    default:
      return [];
  }
}

function convertGeneratedStep(suggestion, step, startUrl) {
  const base = {
    id: createStepId(),
    label: step.label,
    elementLabel: step.elementLabel,
  };

  switch (step.type) {
    case 'go-to-url':
      return { ...base, action: 'goto', url: step.url || startUrl };
    case 'fill-input':
      return { ...base, action: 'fill', value: step.value || '', ...targetMetadata(suggestion, step) };
    case 'click-element':
      return { ...base, action: 'click', ...targetMetadata(suggestion, step) };
    default:
      return { ...base, action: 'goto', url: startUrl };
  }
}

function convertSuggestionToFlowSteps(suggestion, startUrl, successStrategy) {
  const steps = [];

  for (const step of suggestion.generatedSteps || []) {
    if (step.type === 'expect-success') {
      const strategy = successStrategy || step.successStrategies?.[0];
      if (!strategy) continue;
      steps.push(...convertSuccessStrategy(suggestion, strategy));
      continue;
    }
    steps.push(convertGeneratedStep(suggestion, step, startUrl));
  }

  steps.push({ id: createStepId(), action: 'screenshot', label: 'Capture final screenshot' });
  return steps;
}

module.exports = {
  convertSuggestionToFlowSteps,
  getSuccessStrategies,
};
