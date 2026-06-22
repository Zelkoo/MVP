const SAFE_PROBE_PATTERNS =
  /\b(add|show|hide|toggle|expand|collapse|open|close|start|load|begin|enable|disable|switch|view|more|less|try|demo|tab|menu)\b/i;

const UNSAFE_PATTERNS =
  /\b(pay|purchase|place order|checkout|delete account|remove user|confirm order|submit payment|cancel subscription|send message|logout|log out|sign out|delete all|destroy|remove account|delete user)\b/i;

const REQUIRES_CONFIRMATION_PATTERNS =
  /\b(submit|send|register|sign up|signup|contact|apply|subscribe|confirm|purchase|pay)\b/i;

const LOGIN_PATTERNS = /\b(login|log in|sign in)\b/i;

function combinedText(element) {
  return `${element.associatedLabel || ''} ${element.text || ''} ${element.ariaLabel || ''} ${element.humanLabel || ''} ${element.placeholder || ''}`.trim();
}

function classifyActionSafety(element, context = {}) {
  const text = combinedText(element).toLowerCase();
  const actionType = context.actionType || '';

  if (actionType === 'hover') {
    return { safetyLevel: 'safe', reason: 'Hover is non-destructive and safe to probe in isolation.' };
  }

  if (context.safeGeneratedElement) {
    return {
      safetyLevel: 'safe-generated-element',
      reason: 'This control appeared during the current isolated probe session.',
    };
  }

  if (UNSAFE_PATTERNS.test(text)) {
    return {
      safetyLevel: 'unsafe-skipped',
      reason: 'Potentially destructive or payment-related action.',
    };
  }

  if (element.tagName === 'input' && element.type === 'checkbox') {
    return { safetyLevel: 'safe', reason: 'Checkbox controls are safe to probe in isolation.' };
  }

  if (element.tagName === 'input' && element.type === 'radio') {
    return { safetyLevel: 'safe', reason: 'Radio controls are safe to probe in isolation.' };
  }

  if (element.tagName === 'input' && element.type === 'button') {
    return { safetyLevel: 'safe', reason: 'Button inputs are safe to probe in isolation.' };
  }

  if (
    element.tagName === 'input' &&
    ['color', 'date', 'datetime', 'datetime-local', 'time', 'month', 'week', 'number', 'range', 'tel', 'url', 'email', 'search', 'text', ''].includes(
      element.type
    )
  ) {
    return { safetyLevel: 'safe', reason: 'Form controls can be changed safely in isolation without submitting.' };
  }

  if (element.tagName === 'input' && ['submit', 'reset', 'image'].includes(element.type)) {
    return {
      safetyLevel: 'requires-confirmation',
      reason: 'Submit/reset controls may change or send form data and require manual confirmation.',
    };
  }

  if (element.tagName === 'input' && element.type === 'file') {
    return {
      safetyLevel: 'unsafe-skipped',
      reason: 'File upload inputs are skipped during safe discovery.',
    };
  }

  if (element.tagName === 'select') {
    return { safetyLevel: 'safe', reason: 'Dropdown selections are safe to probe in isolation.' };
  }

  if (element.role === 'tab' || element.role === 'switch') {
    return { safetyLevel: 'safe', reason: 'Tab or switch controls are safe to probe.' };
  }

  if (LOGIN_PATTERNS.test(text) && element.tagName !== 'a') {
    return {
      safetyLevel: 'requires-confirmation',
      reason: 'Login actions may submit credentials and require manual confirmation.',
    };
  }

  if (REQUIRES_CONFIRMATION_PATTERNS.test(text)) {
    return {
      safetyLevel: 'requires-confirmation',
      reason: 'This action may submit or change real data and requires manual confirmation.',
    };
  }

  if (SAFE_PROBE_PATTERNS.test(text)) {
    return { safetyLevel: 'safe', reason: 'This looks like a reversible UI control.' };
  }

  if (element.tagName === 'summary' || element.ariaExpanded != null) {
    return { safetyLevel: 'safe', reason: 'Expand/collapse control detected.' };
  }

  if (element.tagName === 'a' && element.href && !element.href.startsWith('#')) {
    return { safetyLevel: 'safe', reason: 'Navigation links are safe to probe when internal.' };
  }

  if (element.tagName === 'button' && text.length > 0 && text.length <= 48) {
    return { safetyLevel: 'safe', reason: 'Short-labeled button likely controls page UI state.' };
  }

  if (element.tagName === 'input' && ['text', 'email', 'search', ''].includes(element.type)) {
    if (actionType === 'fill' || actionType === 'press') {
      return {
        safetyLevel: 'safe',
        reason: 'Text input can be probed with dummy values without submitting the form.',
      };
    }
    return {
      safetyLevel: 'requires-confirmation',
      reason: 'Text input changes may submit data; review before auto-running.',
    };
  }

  return {
    safetyLevel: 'requires-confirmation',
    reason: 'Unknown action risk — review before running automatically.',
  };
}

function isLinkSafeToFollow(link) {
  const href = link.href || '';
  const text = `${link.text || ''} ${link.ariaLabel || ''}`.toLowerCase();

  if (!href || href === '#' || href.startsWith('#')) return false;
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
  if (UNSAFE_PATTERNS.test(text)) return false;

  return true;
}

module.exports = {
  classifyActionSafety,
  isLinkSafeToFollow,
  SAFE_PROBE_PATTERNS,
  UNSAFE_PATTERNS,
};
