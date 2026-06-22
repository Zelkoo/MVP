const { SUCCESS_TEXT_KEYWORDS } = require('./capturePageState');

function confidenceRank(level) {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  return 1;
}

function uniqueSuggestions(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}|${item.value || ''}|${item.elementLabel || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPathSegment(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || parsed.pathname.replace(/^\//, '') || '/';
  } catch {
    return url;
  }
}

function networkUrlFragment(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || parsed.hostname;
  } catch {
    return url.slice(0, 60);
  }
}

function detectSuccessSignals({ before, after, networkEvents = [], triggerLabel = 'the action' }) {
  const suggestions = [];

  if (before.url !== after.url) {
    let beforePath = before.url;
    let afterPath = after.url;
    try {
      beforePath = new URL(before.url).pathname;
      afterPath = new URL(after.url).pathname;
    } catch {
      // keep raw urls
    }

    if (beforePath !== afterPath) {
      const segment = extractPathSegment(after.url);
      suggestions.push({
        id: `url-path-${segment}`,
        type: 'url-changed',
        value: segment,
        confidence: 'high',
        reason: `The page URL changed after ${triggerLabel}.`,
        plainLanguage: `Check that the URL includes "${segment}"`,
        developerDetails: {
          beforeUrl: before.url,
          afterUrl: after.url,
          beforePath,
          afterPath,
        },
      });
    } else {
      suggestions.push({
        id: `url-changed-${after.url}`,
        type: 'url-changed',
        value: extractPathSegment(after.url),
        confidence: 'medium',
        reason: `The browser URL changed after ${triggerLabel}.`,
        plainLanguage: 'Check that the page navigates away from the starting URL',
        developerDetails: { beforeUrl: before.url, afterUrl: after.url },
      });
    }
  }

  const beforeTextSet = new Set((before.visibleTexts || []).map((text) => text.toLowerCase()));
  const newTexts = (after.visibleTexts || []).filter((text) => !beforeTextSet.has(text.toLowerCase()));

  for (const text of newTexts) {
    const lower = text.toLowerCase();
    const keyword = SUCCESS_TEXT_KEYWORDS.find((entry) => lower.includes(entry));
    if (!keyword) continue;

    suggestions.push({
      id: `text-${keyword}-${text.slice(0, 24)}`,
      type: 'page-contains-text',
      value: text.length > 60 ? keyword : text,
      confidence: lower.includes('thank') || lower.includes('success') || lower.includes('subscribed') ? 'high' : 'medium',
      reason: `The page shows "${text}" only after ${triggerLabel}.`,
      plainLanguage: `Check that the page shows text like "${keyword}"`,
      developerDetails: { matchedText: text, keyword },
    });
  }

  const beforeElementMap = new Map((before.visibleElements || []).map((entry) => [entry.signature, entry]));
  const newElements = (after.visibleElements || []).filter((entry) => !beforeElementMap.has(entry.signature));

  for (const element of newElements.slice(0, 4)) {
    const isToastLike = element.role === 'alert' || element.role === 'status';
    suggestions.push({
      id: `element-${element.signature}`,
      type: 'element-visible',
      value: element.selector,
      elementLabel: element.label,
      confidence: isToastLike ? 'high' : 'medium',
      reason: isToastLike
        ? `A confirmation message appeared after ${triggerLabel}.`
        : `"${element.label}" appeared on the page after ${triggerLabel}.`,
      plainLanguage: `Check that "${element.label}" appears on the page`,
      developerDetails: { selector: element.selector, role: element.role },
    });
  }

  const beforeToastSet = new Set((before.toasts || []).map((entry) => entry.signature));
  for (const toast of (after.toasts || []).filter((entry) => !beforeToastSet.has(entry.signature))) {
    suggestions.push({
      id: `toast-${toast.signature}`,
      type: 'page-contains-text',
      value: toast.text.slice(0, 80) || 'success',
      confidence: 'high',
      reason: `A toast or alert appeared after ${triggerLabel}.`,
      plainLanguage: toast.text
        ? `Check that the page shows "${toast.text.slice(0, 60)}"`
        : 'Check that a confirmation message appears',
      developerDetails: { selector: toast.selector, text: toast.text },
    });
  }

  if ((before.forms?.length || 0) > 0) {
    const beforeFields = before.forms.reduce((sum, form) => sum + (form.fieldCount || 0), 0);
    const afterFields = (after.forms || []).reduce((sum, form) => sum + (form.fieldCount || 0), 0);
    const beforeFilled = before.forms.reduce((sum, form) => sum + (form.filledCount || 0), 0);
    const afterFilled = (after.forms || []).reduce((sum, form) => sum + (form.filledCount || 0), 0);

    if (afterFields < beforeFields || (beforeFilled > 0 && afterFilled === 0)) {
      suggestions.push({
        id: 'form-reset',
        type: 'page-contains-text',
        value: 'thank',
        confidence: 'medium',
        reason: `The form cleared or disappeared after ${triggerLabel}.`,
        plainLanguage: 'Check that the form is replaced by a success message',
        developerDetails: {
          beforeFieldCount: beforeFields,
          afterFieldCount: afterFields,
          beforeFilledCount: beforeFilled,
          afterFilledCount: afterFilled,
        },
      });
    }
  }

  for (const event of networkEvents) {
    if (!['POST', 'PUT', 'PATCH'].includes(event.method)) continue;
    if (event.status < 200 || event.status >= 300) continue;

    const fragment = networkUrlFragment(event.url);
    suggestions.push({
      id: `network-${event.method}-${fragment}`,
      type: 'network-2xx-after-submit',
      value: fragment,
      confidence: 'high',
      reason: `A ${event.method} request returned ${event.status} after ${triggerLabel}.`,
      plainLanguage: 'Check that the server accepts the submission successfully',
      developerDetails: {
        method: event.method,
        url: event.url,
        status: event.status,
      },
    });
  }

  if (
    before.cartCount != null &&
    after.cartCount != null &&
    before.cartCount !== after.cartCount
  ) {
    suggestions.push({
      id: `cart-count-${after.cartCount}`,
      type: 'page-contains-text',
      value: String(after.cartCount),
      confidence: 'high',
      reason: `The cart count changed from ${before.cartCount} to ${after.cartCount} after ${triggerLabel}.`,
      plainLanguage: `Check that the cart shows ${after.cartCount} item(s)`,
      developerDetails: { beforeCount: before.cartCount, afterCount: after.cartCount },
    });
  }

  const beforeButtons = new Map((before.buttons || []).map((entry) => [entry.signature, entry]));
  for (const button of after.buttons || []) {
    const previous = beforeButtons.get(button.signature);
    if (!previous) continue;
    if (previous.disabled !== button.disabled) {
      suggestions.push({
        id: `button-state-${button.signature}`,
        type: 'element-visible',
        value: button.selector,
        elementLabel: button.label,
        confidence: 'low',
        reason: `The "${button.label}" button changed state after ${triggerLabel}.`,
        plainLanguage: `Check that "${button.label}" reflects the completed action`,
        developerDetails: {
          selector: button.selector,
          beforeDisabled: previous.disabled,
          afterDisabled: button.disabled,
        },
      });
      break;
    }
  }

  return uniqueSuggestions(suggestions).sort(
    (a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence)
  );
}

module.exports = {
  detectSuccessSignals,
};
