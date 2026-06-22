function indexElements(elements = []) {
  return new Map(elements.map((element) => [element.signature, element]));
}

function detectNewElements(before, after) {
  const beforeMap = indexElements(before.elements);
  return after.elements.filter((element) => !beforeMap.has(element.signature));
}

function detectRemovedElements(before, after) {
  const afterMap = indexElements(after.elements);
  return before.elements.filter((element) => !afterMap.has(element.signature));
}

function detectTextChanges(before, after) {
  const afterMap = indexElements(after.elements);
  const changes = [];

  for (const element of before.elements) {
    const next = afterMap.get(element.signature);
    if (!next) continue;
    if (element.text !== next.text || element.value !== next.value) {
      changes.push({ before: element, after: next });
    }
  }

  return changes;
}

function detectRevealedElements(before, after) {
  const afterMap = indexElements(after.elements);
  const revealed = [];

  for (const element of before.elements) {
    const next = afterMap.get(element.signature);
    if (!next) continue;

    const beforeHidden =
      element.computedStyle?.opacity === '0' ||
      element.computedStyle?.visibility === 'hidden' ||
      element.computedStyle?.display === 'none' ||
      Number(element.computedStyle?.opacity) === 0;

    const afterVisible =
      next.computedStyle?.visibility !== 'hidden' &&
      next.computedStyle?.display !== 'none' &&
      Number(next.computedStyle?.opacity) > 0;

    if (beforeHidden && afterVisible && (next.text || next.hiddenDescendantText)) {
      revealed.push(next);
    }
  }

  return revealed;
}

function detectStyleVisibilityChanges(before, after) {
  const afterMap = indexElements(after.elements);
  const changes = [];

  for (const element of before.elements) {
    const next = afterMap.get(element.signature);
    if (!next) continue;

    const opacityBefore = Number(element.computedStyle?.opacity ?? 1);
    const opacityAfter = Number(next.computedStyle?.opacity ?? 1);
    const visibilityChanged =
      element.computedStyle?.visibility !== next.computedStyle?.visibility ||
      element.computedStyle?.display !== next.computedStyle?.display ||
      Math.abs(opacityBefore - opacityAfter) >= 0.5;

    if (visibilityChanged && (next.text || element.hiddenDescendantText)) {
      changes.push({ before: element, after: next });
    }
  }

  return changes;
}
function detectAriaVisibilityChanges(before, after) {
  const afterMap = indexElements(after.elements);
  const changes = [];

  for (const element of before.elements) {
    const next = afterMap.get(element.signature);
    if (!next) continue;
    if (element.ariaHidden !== next.ariaHidden || element.ariaExpanded !== next.ariaExpanded) {
      changes.push({ before: element, after: next });
    }
  }

  return changes;
}

function detectUrlChange(before, after) {
  return before.url !== after.url
    ? { beforeUrl: before.url, afterUrl: after.url }
    : null;
}

function detectControlStateChanges(before, after) {
  const afterMap = indexElements(after.elements);
  const changes = [];

  for (const element of before.elements) {
    const next = afterMap.get(element.signature);
    if (!next) continue;

    if (element.tagName === 'select' && element.value !== next.value) {
      changes.push({
        type: 'select-value-changed',
        description: `Select value changed from "${element.value}" to "${next.value}".`,
        element: next,
        beforeValue: element.value,
        afterValue: next.value,
        confidence: 0.88,
      });
    }

    if (
      element.tagName === 'input' &&
      !['checkbox', 'radio'].includes(element.type) &&
      element.value !== next.value
    ) {
      changes.push({
        type: 'input-value-changed',
        description: `Input value changed to "${next.value}".`,
        element: next,
        beforeValue: element.value,
        afterValue: next.value,
        confidence: 0.84,
      });
    }

    if (
      (element.type === 'checkbox' || element.type === 'radio' || element.role === 'checkbox' || element.role === 'radio') &&
      element.checked !== next.checked
    ) {
      changes.push({
        type: 'checked-state-changed',
        description: `Control checked state changed to ${next.checked}.`,
        element: next,
        beforeChecked: element.checked,
        afterChecked: next.checked,
        confidence: 0.86,
      });
    }

    if (element.ariaChecked !== next.ariaChecked && next.ariaChecked != null) {
      changes.push({
        type: 'checked-state-changed',
        description: `ARIA checked state changed to ${next.ariaChecked}.`,
        element: next,
        confidence: 0.84,
      });
    }
  }

  return changes;
}

function normalizeDiffChanges(rawDiff) {
  const changes = [];

  if (rawDiff.urlChange) {
    changes.push({
      type: 'url-changed',
      description: `URL changed to ${rawDiff.urlChange.afterUrl}.`,
      confidence: 0.9,
      afterUrl: rawDiff.urlChange.afterUrl,
    });
  }

  for (const element of rawDiff.newElements) {
    const label = element.humanLabel || element.text || element.tagName;
    const isDialog = element.role === 'dialog';
    changes.push({
      type: isDialog ? 'modal-appeared' : 'element-added',
      description: isDialog
        ? `A dialog appeared: ${label}.`
        : `A new visible element appeared: ${label}.`,
      element,
      confidence: isDialog ? 0.88 : 0.85,
    });
  }

  for (const element of rawDiff.removedElements) {
    const label = element.humanLabel || element.text || element.tagName;
    changes.push({
      type: 'element-removed',
      description: `An element disappeared: ${label}.`,
      element,
      confidence: 0.84,
    });
  }

  for (const change of rawDiff.textChanges) {
    if (change.before.text !== change.after.text) {
      changes.push({
        type: 'text-changed',
        description: `Text changed on ${change.after.humanLabel || change.after.text}.`,
        element: change.after,
        confidence: 0.72,
      });
    }
  }

  for (const change of rawDiff.styleVisibilityChanges || []) {
    changes.push({
      type: 'hover-content-revealed',
      description: `Hidden content became visible on ${change.after.humanLabel || change.after.text || 'element'}.`,
      element: change.after,
      confidence: 0.86,
    });
  }

  for (const element of rawDiff.revealedElements || []) {
    changes.push({
      type: 'hover-content-revealed',
      description: `Revealed content: ${element.humanLabel || element.text || element.hiddenDescendantText}.`,
      element,
      confidence: 0.88,
    });
  }

  for (const change of rawDiff.visibilityChanges) {
    const expanded = change.after.ariaExpanded;
    if (expanded != null && expanded !== change.before.ariaExpanded) {
      changes.push({
        type: 'aria-expanded-changed',
        description: `Expanded state changed to ${expanded}.`,
        element: change.after,
        confidence: 0.8,
      });
    } else {
      changes.push({
        type: 'visibility-changed',
        description: `Visibility changed for ${change.after.humanLabel || change.after.text}.`,
        element: change.after,
        confidence: 0.74,
      });
    }
  }

  changes.push(...rawDiff.controlStateChanges || []);

  if (rawDiff.elementCountDelta > 3 && rawDiff.newElements.length === 0) {
    changes.push({
      type: 'content-changed',
      description: 'Page content changed significantly after the action.',
      confidence: 0.65,
    });
  }

  const beforeText = rawDiff.before?.visibleTextSample || '';
  const afterText = rawDiff.after?.visibleTextSample || '';
  if (
    afterText.length > beforeText.length + 20 &&
    /invalid|error|required|failed|incorrect|unable/i.test(afterText)
  ) {
    changes.push({
      type: 'error-message-appeared',
      description: 'An error or validation message appeared on the page.',
      confidence: 0.76,
    });
  }

  return changes;
}

function diffPageStates(before, after) {
  const newElements = detectNewElements(before, after);
  const removedElements = detectRemovedElements(before, after);
  const textChanges = detectTextChanges(before, after);
  const visibilityChanges = detectAriaVisibilityChanges(before, after);
  const styleVisibilityChanges = detectStyleVisibilityChanges(before, after);
  const revealedElements = detectRevealedElements(before, after);
  const urlChange = detectUrlChange(before, after);
  const controlStateChanges = detectControlStateChanges(before, after);

  const raw = {
    before,
    after,
    newElements,
    removedElements,
    textChanges,
    visibilityChanges,
    styleVisibilityChanges,
    revealedElements,
    urlChange,
    controlStateChanges,
    elementCountDelta: after.elementCount - before.elementCount,
  };

  return {
    ...raw,
    changes: normalizeDiffChanges(raw),
  };
}

function diffDomSnapshots(before, after) {
  return diffPageStates(before, after);
}

function hasMeaningfulChange(diff) {
  return (
    diff.changes.length > 0 ||
    diff.newElements.length > 0 ||
    diff.removedElements.length > 0 ||
    (diff.revealedElements || []).length > 0 ||
    Boolean(diff.urlChange)
  );
}

module.exports = {
  diffPageStates,
  diffDomSnapshots,
  detectNewElements,
  detectRemovedElements,
  detectTextChanges,
  detectAriaVisibilityChanges,
  detectStyleVisibilityChanges,
  detectRevealedElements,
  detectUrlChange,
  hasMeaningfulChange,
};
