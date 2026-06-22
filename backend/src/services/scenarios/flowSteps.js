const FLOW_STEP_ACTIONS = [
  'goto',
  'click',
  'hover',
  'fill',
  'select',
  'check',
  'uncheck',
  'press',
  'waitForText',
  'expectUrlContains',
  'expectVisible',
  'expectHidden',
  'expectNotVisible',
  'expectValue',
  'expectChecked',
  'expectNetworkSuccess',
  'screenshot',
];

const STEP_LABELS = {
  goto: 'Go to URL',
  click: 'Click element',
  hover: 'Hover element',
  fill: 'Fill input',
  select: 'Select option',
  check: 'Check control',
  uncheck: 'Uncheck control',
  press: 'Press key',
  waitForText: 'Wait for text',
  expectUrlContains: 'Expect URL contains',
  expectVisible: 'Expect element visible',
  expectHidden: 'Expect element hidden',
  expectNotVisible: 'Expect element not visible',
  expectValue: 'Expect input value',
  expectChecked: 'Expect checked state',
  expectNetworkSuccess: 'Expect successful request',
  screenshot: 'Take screenshot',
};

const STEP_RECOMMENDATIONS = {
  goto: 'Verify the URL is correct and publicly reachable.',
  click: 'Use a stable selector or visible button/link text. Add a data-testid for best reliability.',
  hover: 'Use a selector for the element that reveals content on hover.',
  fill: 'Confirm the input selector matches the form field. Add a data-testid for best reliability.',
  select: 'Use a selector for the dropdown and a valid option value.',
  check: 'Use a selector for the checkbox or switch to check.',
  uncheck: 'Use a selector for the checkbox or switch to uncheck.',
  press: 'Use a safe key such as Enter or Tab for keyboard interactions.',
  waitForText: 'Use text that appears after the action completes.',
  expectUrlContains: 'Use a URL fragment that indicates success (e.g. thank-you).',
  expectVisible: 'Use a selector for an element that proves the step worked. Add a data-testid for best reliability.',
  expectHidden: 'Use a selector for an element that should disappear after the action.',
  expectNotVisible: 'Use a selector for an element that should disappear after the action.',
  expectValue: 'Use a selector and expected value for the input field.',
  expectChecked: 'Use a selector for the checkbox or radio that should be checked.',
  expectNetworkSuccess: 'Use an optional URL fragment to match the successful API call.',
  screenshot: 'Screenshots help document the final state of the flow.',
};

function stepLabel(step) {
  if (step.label) return step.label;
  return STEP_LABELS[step.action] || step.action;
}

function validateStep(step, index) {
  if (!step || typeof step !== 'object') {
    throw new Error(`Step ${index + 1} is invalid.`);
  }

  if (!FLOW_STEP_ACTIONS.includes(step.action)) {
    throw new Error(`Step ${index + 1} has unsupported action "${step.action}".`);
  }

  switch (step.action) {
    case 'goto':
      if (!step.url || typeof step.url !== 'string') {
        throw new Error(`Step ${index + 1} (goto) requires a url.`);
      }
      break;
    case 'click':
      if (!step.selector && !step.text && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (click) requires selector, text, or target metadata.`);
      }
      break;
    case 'hover':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (hover) requires a selector or target metadata.`);
      }
      break;
    case 'fill':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (fill) requires a selector or target metadata.`);
      }
      break;
    case 'select':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (select) requires a selector or target metadata.`);
      }
      if (step.value == null || step.value === '') {
        throw new Error(`Step ${index + 1} (select) requires value.`);
      }
      break;
    case 'check':
    case 'uncheck':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (${step.action}) requires a selector or target metadata.`);
      }
      break;
    case 'press':
      if (!step.value) {
        throw new Error(`Step ${index + 1} (press) requires value (key name).`);
      }
      break;
    case 'waitForText':
      if (!step.text) {
        throw new Error(`Step ${index + 1} (waitForText) requires text.`);
      }
      break;
    case 'expectUrlContains':
      if (!step.value) {
        throw new Error(`Step ${index + 1} (expectUrlContains) requires value.`);
      }
      break;
    case 'expectVisible':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (expectVisible) requires a selector or target metadata.`);
      }
      break;
    case 'expectHidden':
    case 'expectNotVisible':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (${step.action}) requires a selector or target metadata.`);
      }
      break;
    case 'expectValue':
      if ((!step.selector && !step.targetText && !step.targetRole) || step.value == null) {
        throw new Error(`Step ${index + 1} (expectValue) requires selector and value.`);
      }
      break;
    case 'expectChecked':
      if (!step.selector && !step.targetText && !step.targetRole) {
        throw new Error(`Step ${index + 1} (expectChecked) requires a selector or target metadata.`);
      }
      break;
    case 'expectNetworkSuccess':
      break;
    default:
      break;
  }
}

function validateFlowSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('Flow scenarios require at least one step.');
  }

  if (steps.length > 30) {
    throw new Error('Flow scenarios support up to 30 steps.');
  }

  steps.forEach((step, index) => validateStep(step, index));
  return steps;
}

function normalizeFlowConfig(config, startUrl) {
  const steps = Array.isArray(config?.steps) ? config.steps : [];
  const normalized = steps.map((step, index) => {
    const copy = { ...step };
    if (copy.action === 'expectNotVisible') {
      copy.action = 'expectHidden';
    }
    if (copy.action === 'goto' && !copy.url) {
      copy.url = startUrl;
    }
    if (copy.action === 'fill' && copy.value == null) {
      copy.value = '';
    }
    if (copy.action === 'waitForText' && !copy.timeoutMs) {
      copy.timeoutMs = 8000;
    }
    if (!copy.label) {
      copy.label = `${index + 1}. ${stepLabel(copy)}`;
    }
    return copy;
  });

  validateFlowSteps(normalized);
  const base = config && typeof config === 'object' ? config : {};
  return {
    ...base,
    steps: normalized,
  };
}

module.exports = {
  FLOW_STEP_ACTIONS,
  STEP_LABELS,
  STEP_RECOMMENDATIONS,
  stepLabel,
  validateFlowSteps,
  normalizeFlowConfig,
};
