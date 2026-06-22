const crypto = require('crypto');
const { classifyActionSafety } = require('./safeActionClassifier');

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'textarea', 'select', 'summary']);

const HOVER_CLASS_HINT =
  /card|tile|item|avatar|profile|product|menu|nav|figure|caption|hover|thumb|gallery|grid|panel/i;

function actionTypeForElement(element) {
  if (element.tagName === 'select') return 'select';
  if (element.tagName === 'textarea') return 'fill';
  if (element.tagName === 'input') {
    const type = element.type || 'text';
    if (type === 'hidden' || type === 'file') return null;
    if (type === 'checkbox') return element.checked ? 'uncheck' : 'check';
    if (type === 'radio') return 'check';
    if (type === 'button') return 'click';
    if (type === 'submit' || type === 'reset' || type === 'image') return 'click';
    if (type === 'range') return 'fill';
    if (
      ['color', 'date', 'datetime', 'datetime-local', 'time', 'month', 'week', 'number', 'tel', 'url', 'email', 'search', 'password', 'text', ''].includes(
        type
      )
    ) {
      return 'fill';
    }
  }
  if (element.tagName === 'a') return 'navigate';
  if (element.role === 'tab') return 'click';
  if (element.role === 'menuitem') return 'click';
  return 'click';
}

function importanceScore(element, actionType) {
  let score = 0;
  const text = `${element.associatedLabel || ''} ${element.text || ''} ${element.ariaLabel || ''} ${element.humanLabel || ''} ${element.classes || ''}`.toLowerCase();

  if (INTERACTIVE_TAGS.has(element.tagName)) score += 2;
  if (element.boundingBox?.y >= 0 && element.boundingBox?.y < 700) score += 1;
  if (element.text && element.text.length >= 2) score += 1;
  if (element.selectorAlternatives?.length > 1) score += 0.5;
  if (/add|toggle|show|hide|start|load|open|checkbox|dropdown|select|tab|menu/i.test(text)) score += 2;
  if (actionType === 'hover' && (element.hoverPotential || element.hiddenDescendantText)) score += 4;
  if (element.disabled) score -= 5;

  return score;
}

function categoryForElement(element, actionType) {
  if (actionType === 'hover') return 'hover-target';
  if (element.tagName === 'select') return 'dropdown';
  if (element.type === 'checkbox' || element.role === 'checkbox') return 'checkbox';
  if (element.type === 'radio' || element.role === 'radio') return 'radio';
  if (element.role === 'tab') return 'tab';
  if (element.role === 'dialog') return 'modal';
  if (element.tagName === 'a' || actionType === 'navigate') return 'navigation';
  if (element.tagName === 'button') return 'button';
  if (actionType === 'fill') return 'form-input';
  if (actionType === 'press') return 'keyboard';
  return 'interactive';
}

function buildCandidate(element, actionType, reason, context = {}) {
  const safety = classifyActionSafety(element, { ...context, actionType });
  const importance = importanceScore(element, actionType);

  return {
    id: `${actionType}-${element.signature}-${crypto.createHash('md5').update(element.selector).digest('hex').slice(0, 8)}`,
    actionType,
    element,
    selector: element.selector,
    selectorAlternatives: element.selectorAlternatives || [],
    humanLabel: element.humanLabel || element.text || element.ariaLabel || element.tagName,
    elementSummary: `${element.tagName}${element.text ? `: ${element.text.slice(0, 60)}` : ''}`,
    category: categoryForElement(element, actionType),
    confidence: Math.min(0.95, 0.45 + importance * 0.08),
    safetyLevel: safety.safetyLevel,
    safetyReason: safety.reason,
    boundingBox: element.boundingBox,
    reason,
    importance,
    safetyScore: safety.safetyLevel === 'safe' || safety.safetyLevel === 'safe-generated-element' ? 1 : 0,
    actionSuggestions: [actionType],
  };
}

function isHoverCandidate(element) {
  if (!element.boundingBox) return false;
  const area = (element.boundingBox.width || 0) * (element.boundingBox.height || 0);
  if (area < 1600) return false;

  if (element.hoverPotential) return true;
  if (element.hiddenDescendantText) return true;
  if (element.hiddenDescendantCount > 0) return true;

  const tag = element.tagName;
  const classes = `${element.classes || ''} ${element.role || ''}`;
  if (['figure', 'img', 'article'].includes(tag)) return true;
  if (HOVER_CLASS_HINT.test(classes)) return true;

  return false;
}

function isKeyboardCandidate(element, pageState) {
  if (element.tagName !== 'input' && element.tagName !== 'textarea') return false;
  if (['checkbox', 'radio', 'hidden', 'submit', 'button', 'file', 'color', 'date', 'range', 'image', 'reset'].includes(element.type)) {
    return false;
  }
  if (pageState?.keyboardResponseLikely) return true;
  return /type|search|key|input|message|comment|name|email|text|default|tel|url|number/i.test(
    `${element.associatedLabel || ''} ${element.placeholder || ''} ${element.name || ''} ${element.ariaLabel || ''} ${element.humanLabel || ''}`
  );
}

function emptyCounts() {
  return {
    clickCandidates: 0,
    hoverCandidates: 0,
    formCandidates: 0,
    selectCandidates: 0,
    checkboxCandidates: 0,
    radioCandidates: 0,
    keyboardCandidates: 0,
    navigationCandidates: 0,
    totalCandidates: 0,
  };
}

function findCandidateActions(pageState, context = {}) {
  const candidates = [];
  const counts = emptyCounts();
  const seen = new Set();

  function pushCandidate(candidate) {
    const key = `${candidate.actionType}|${candidate.element.signature}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);

    switch (candidate.actionType) {
      case 'hover':
        counts.hoverCandidates += 1;
        break;
      case 'fill':
        counts.formCandidates += 1;
        break;
      case 'select':
        counts.selectCandidates += 1;
        break;
      case 'check':
      case 'uncheck':
        if (candidate.element.type === 'radio' || candidate.element.role === 'radio') {
          counts.radioCandidates += 1;
        } else {
          counts.checkboxCandidates += 1;
        }
        break;
      case 'navigate':
        counts.navigationCandidates += 1;
        break;
      case 'press':
        counts.keyboardCandidates += 1;
        break;
      default:
        counts.clickCandidates += 1;
        break;
    }
    counts.totalCandidates += 1;
  }

  for (const element of pageState.elements || []) {
    if (element.disabled) continue;

    const isInteractive =
      INTERACTIVE_TAGS.has(element.tagName) ||
      ['button', 'link', 'tab', 'switch', 'checkbox', 'radio', 'menuitem', 'option'].includes(element.role);

    if (isInteractive) {
      if (element.tagName === 'a' && (!element.href || element.href.startsWith('#'))) {
        // skip anchors
      } else {
        const actionType = actionTypeForElement(element);
        if (!actionType) continue;

        pushCandidate(
          buildCandidate(
            element,
            actionType === 'navigate' ? 'click' : actionType,
            `Interactive ${element.humanLabel || element.tagName} worth probing`,
            context
          )
        );

        if (element.tagName === 'a' && element.href && !element.href.startsWith('#')) {
          pushCandidate(
            buildCandidate(element, 'navigate', 'Internal navigation link', context)
          );
        }
      }
    }

    if (isHoverCandidate(element)) {
      pushCandidate(
        buildCandidate(element, 'hover', 'Element may reveal content on hover', context)
      );
    }

    if (isKeyboardCandidate(element, pageState)) {
      pushCandidate(
        buildCandidate(element, 'press', 'Typing may update visible page output', context)
      );
    }
  }

  const probeOrder = {
    hover: 0,
    select: 1,
    check: 2,
    uncheck: 2,
    click: 3,
    navigate: 4,
    fill: 5,
    press: 6,
  };

  candidates.sort(
    (a, b) =>
      (probeOrder[a.actionType] ?? 9) - (probeOrder[b.actionType] ?? 9) ||
      b.importance + b.safetyScore - (a.importance + a.safetyScore)
  );

  return { candidates, counts };
}

module.exports = {
  findCandidateActions,
  actionTypeForElement,
  importanceScore,
  emptyCounts,
  isHoverCandidate,
};
