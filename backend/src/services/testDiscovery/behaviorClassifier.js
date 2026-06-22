function isInteractiveElement(element) {
  if (!element) return false;
  return (
    ['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(element.tagName) ||
    ['button', 'link', 'tab', 'switch', 'checkbox', 'radio', 'menuitem'].includes(element.role)
  );
}

function classifyBehavior({ action, before, after, diff, safety, dynamicLoading }) {
  const changes = diff.changes || [];
  const actionElement = action.element;
  const actionLabel = action.humanLabel || actionElement.humanLabel || actionElement.text || 'control';

  if (dynamicLoading) {
    const finalText = dynamicLoading.finalText;
    return {
      type: 'dynamic-loading',
      summary: `Clicking "${actionLabel}" triggered loading and revealed new content.`,
      confidence: 0.86,
      confidenceLevel: 'high',
      action,
      before: dynamicLoading.before,
      after: dynamicLoading.after,
      diff: dynamicLoading.diff,
      safety,
      finalText,
      reasoning: dynamicLoading.reasoning || [
        'Loading phase detected after click.',
        'Final content appeared after wait.',
      ],
    };
  }

  const hoverRevealChanges = changes.filter((change) => change.type === 'hover-content-revealed');
  const revealedElements = diff.revealedElements || [];
  if (
    action.actionType === 'hover' &&
    (hoverRevealChanges.length > 0 ||
      revealedElements.length > 0 ||
      diff.newElements.length > 0 ||
      (diff.styleVisibilityChanges || []).length > 0)
  ) {
    const revealed =
      revealedElements[0] ||
      hoverRevealChanges[0]?.element ||
      diff.newElements.find((el) => el.text || el.hiddenDescendantText) ||
      diff.newElements[0];
    return {
      type: 'hover-reveal',
      summary: `Hovering "${actionLabel}" revealed additional content${revealed?.text ? `: ${revealed.text.slice(0, 80)}` : ''}.`,
      confidence: 0.9,
      confidenceLevel: 'high',
      action,
      before,
      after,
      diff,
      safety,
      revealedElement: revealed,
      reasoning: [
        'A hover candidate was probed safely.',
        'Hidden or low-opacity content became visible after hover.',
      ],
    };
  }

  if (action.actionType === 'press') {
    const textDelta = (after.visibleTextSample || '').length - (before.visibleTextSample || '').length;
    if (textDelta > 5 || changes.some((change) => change.type === 'text-changed')) {
      return {
        type: 'keyboard-response',
        summary: `Typing into "${actionLabel}" updated visible page output.`,
        confidence: 0.8,
        confidenceLevel: 'medium',
        action,
        before,
        after,
        diff,
        safety,
        reasoning: ['Keyboard input changed visible text on the page.'],
      };
    }
  }

  if (action.actionType === 'fill' || action.actionType === 'press') {
    const valueChange = changes.find((change) => change.type === 'input-value-changed' || change.type === 'text-changed');
    if (valueChange) {
      const inputType = actionElement.type || 'text';
      return {
        type: inputType === 'range' ? 'range-input-changed' : inputType === 'color' ? 'color-input-changed' : 'text-update',
        summary: `Updating "${actionLabel}" changed the control value${valueChange.afterValue ? ` to "${valueChange.afterValue}"` : ''}.`,
        confidence: 0.82,
        confidenceLevel: 'medium',
        action,
        before,
        after,
        diff,
        safety,
        controlElement: valueChange.element || actionElement,
        reasoning: ['A form control value changed after interaction.'],
      };
    }
  }

  if (diff.urlChange && (actionElement.tagName === 'a' || action.actionType === 'navigate')) {
    return {
      type: 'navigation',
      summary: `Clicking "${action.humanLabel}" navigated to ${diff.urlChange.afterUrl}.`,
      confidence: 0.82,
      confidenceLevel: 'high',
      action,
      before,
      after,
      diff,
      safety,
      destinationUrl: diff.urlChange.afterUrl,
      reasoning: [
        'The clicked element was a link.',
        'The page URL changed after the click.',
      ],
    };
  }

  const selectChange = changes.find((change) => change.type === 'select-value-changed');
  if (selectChange) {
    return {
      type: 'dropdown-selection',
      summary: `Selecting an option changed the dropdown value to "${selectChange.afterValue}".`,
      confidence: 0.86,
      confidenceLevel: 'high',
      action,
      before,
      after,
      diff,
      safety,
      selectedValue: selectChange.afterValue,
      selectedLabel: selectChange.element?.text || selectChange.afterValue,
      reasoning: [
        'A select control was interacted with.',
        'The selected value changed after the action.',
      ],
    };
  }

  const checkedChange = changes.find((change) => change.type === 'checked-state-changed');
  if (checkedChange) {
    const type = actionElement.type === 'radio' || actionElement.role === 'radio'
      ? 'radio-selection'
      : 'checkbox-toggle';
    return {
      type,
      summary: `Clicking the control changed its checked state to ${checkedChange.afterChecked ?? checkedChange.element?.checked}.`,
      confidence: 0.84,
      confidenceLevel: 'high',
      action,
      before,
      after,
      diff,
      safety,
      controlElement: checkedChange.element || actionElement,
      reasoning: [
        'A checkbox or radio control was clicked.',
        'Its checked state changed after the interaction.',
      ],
    };
  }

  const modalChange = changes.find((change) => change.type === 'modal-appeared');
  if (modalChange) {
    return {
      type: 'modal-open-close',
      summary: `Clicking "${action.humanLabel}" opened a dialog.`,
      confidence: 0.8,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      modalElement: modalChange.element,
      reasoning: [
        'A dialog or modal element became visible after the click.',
      ],
    };
  }

  const expandedChange = changes.find((change) => change.type === 'aria-expanded-changed');
  if (expandedChange) {
    const isTab = actionElement.role === 'tab' || /tab/i.test(actionElement.classes || '');
    if (isTab) {
      return {
        type: 'tab-switch',
        summary: `Clicking tab "${actionLabel}" changed the active tab state.`,
        confidence: 0.82,
        confidenceLevel: 'high',
        action,
        before,
        after,
        diff,
        safety,
        targetElement: expandedChange.element,
        reasoning: ['Tab control aria-expanded state changed after click.'],
      };
    }

    const isMenu = /menu|nav/i.test(`${actionElement.classes || ''} ${actionLabel}`);
    if (isMenu) {
      return {
        type: 'menu-open-close',
        summary: `Clicking "${actionLabel}" opened or closed a menu.`,
        confidence: 0.8,
        confidenceLevel: 'medium',
        action,
        before,
        after,
        diff,
        safety,
        targetElement: expandedChange.element,
        reasoning: ['Menu-like control changed expanded state.'],
      };
    }

    return {
      type: 'expand-collapse',
      summary: `Clicking "${action.humanLabel}" changed expanded/collapsed state.`,
      confidence: 0.78,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      targetElement: expandedChange.element,
      reasoning: [
        'An aria-expanded attribute changed after the click.',
      ],
    };
  }

  if (changes.some((change) => change.type === 'visibility-changed') && diff.newElements.length === 0) {
    return {
      type: 'toggle-visibility',
      summary: `Clicking "${action.humanLabel}" changed what is visible on the page.`,
      confidence: 0.74,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      reasoning: [
        'Element visibility changed without a full navigation.',
      ],
    };
  }

  const newInteractive = diff.newElements.filter(isInteractiveElement);
  if (newInteractive.length > 0) {
    return {
      type: 'dynamic-element-created',
      summary: `Clicking "${action.humanLabel}" created ${newInteractive.length} new visible control(s).`,
      confidence: 0.88,
      confidenceLevel: 'high',
      action,
      before,
      after,
      diff,
      safety,
      createdElements: newInteractive,
      reasoning: [
        'The clicked element was classified as safe to probe.',
        `${newInteractive.length} new visible interactive element(s) appeared after the click.`,
      ],
    };
  }

  if (changes.some((change) => change.type === 'error-message-appeared')) {
    const hasPasswordField = before.elements.some((el) => el.type === 'password');
    return {
      type: hasPasswordField ? 'login-error' : 'form-validation',
      summary: hasPasswordField
        ? 'Invalid credentials produced a visible error message.'
        : 'Submitting or interacting with the form showed a validation/error message.',
      confidence: 0.76,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      reasoning: [
        'An error or validation message appeared after the action.',
      ],
    };
  }

  if (changes.some((change) => change.type === 'text-changed') && action.actionType === 'fill') {
    return {
      type: 'text-update',
      summary: `Updating "${actionLabel}" changed visible text on the page.`,
      confidence: 0.78,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      reasoning: ['Input interaction changed visible text.'],
    };
  }

  if (
    after.visibleTextSample.length > before.visibleTextSample.length + 15 &&
    /\b(start|load|begin)\b/i.test(action.humanLabel)
  ) {
    return {
      type: 'dynamic-loading',
      summary: `Clicking "${action.humanLabel}" revealed new content after loading.`,
      confidence: 0.72,
      confidenceLevel: 'medium',
      action,
      before,
      after,
      diff,
      safety,
      reasoning: [
        'A start/load style control was clicked.',
        'Additional content appeared afterward.',
      ],
    };
  }

  if (changes.length > 0) {
    return {
      type: 'ui-state-changed',
      summary: `Clicking "${action.humanLabel}" changed the page state.`,
      confidence: 0.62,
      confidenceLevel: 'low',
      action,
      before,
      after,
      diff,
      safety,
      reasoning: changes.slice(0, 3).map((change) => change.description),
    };
  }

  return null;
}

function upgradeToRemovableBehavior(baseBehavior, generatedElement, afterRemoveDiff) {
  const removed =
    afterRemoveDiff.removedElements.some((el) => el.signature === generatedElement.signature) ||
    afterRemoveDiff.changes.some(
      (change) =>
        change.type === 'element-removed' && change.element?.signature === generatedElement.signature
    );

  if (!removed) return null;

  return {
    ...baseBehavior,
    type: 'dynamic-element-created-and-removable',
    summary: `Clicking "${baseBehavior.action.humanLabel}" created "${generatedElement.humanLabel || generatedElement.text}", and clicking the generated control removed it again.`,
    confidence: 0.92,
    confidenceLevel: 'high',
    generatedElement,
    afterRemoveDiff,
    reasoning: [
      ...baseBehavior.reasoning,
      'A new interactive element appeared after the first click.',
      'Clicking the generated element removed it again during the same isolated session.',
    ],
  };
}

module.exports = {
  classifyBehavior,
  upgradeToRemovableBehavior,
  isInteractiveElement,
};
