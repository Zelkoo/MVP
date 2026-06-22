function truncateText(text, maxLength = 80) {
  if (!text) return '';
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function cleanLabel(text, maxLength = 50) {
  if (!text) return '';
  return truncateText(String(text).replace(/\s+/g, ' ').trim(), maxLength);
}

function pathFromUrl(url) {
  if (!url) return '/';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

function shortNavigationTitle(behavior, pageUrl) {
  const destinationPath = pathFromUrl(behavior.destinationUrl || behavior.after?.url);
  const rawLabel =
    behavior.action?.humanLabel ||
    behavior.action?.element?.humanLabel ||
    behavior.action?.element?.text ||
    '';

  const label = cleanLabel(rawLabel, 50);
  const looksLikeUrl = /^(https?:\/\/|www\.)/i.test(label);
  const looksTooLong = label.length > 48;

  if (label && !looksLikeUrl && !looksTooLong) {
    return truncateText(`Navigation: ${label}`, 80);
  }

  const path = destinationPath !== '/' ? destinationPath : pathFromUrl(pageUrl);
  return truncateText(`Navigation: ${path}`, 80);
}

function createShortSuggestionTitle(behavior, pageUrl) {
  const type = behavior.type || behavior.patternType;
  const label = cleanLabel(
    behavior.action?.humanLabel ||
      behavior.action?.element?.humanLabel ||
      behavior.action?.element?.text ||
      behavior.primaryLabel,
    40
  );

  switch (type) {
    case 'navigation':
      return shortNavigationTitle(behavior, pageUrl);
    case 'broken-links':
      return 'Broken links check';
    case 'hover-reveal':
      return label ? truncateText(`Hover reveal: ${label}`, 80) : 'Hover reveal';
    case 'dynamic-element-created-and-removable':
      return 'Dynamic UI: add/remove element';
    case 'dynamic-element-created':
      return 'Dynamic UI: create element';
    case 'checkbox-toggle':
      return 'Checkbox toggle';
    case 'radio-selection':
      return 'Radio selection';
    case 'dropdown-selection':
      return 'Dropdown selection';
    case 'form-validation':
      return 'Form validation';
    case 'login-error':
      return 'Invalid login error';
    case 'dynamic-loading':
      return label ? truncateText(`Dynamic loading: ${label}`, 80) : 'Dynamic loading flow';
    case 'modal-open-close':
      return label ? truncateText(`Modal flow: ${label}`, 80) : 'Modal open/close';
    case 'cta':
    case 'primary-cta':
      return label ? truncateText(`CTA navigation: ${label}`, 80) : 'CTA navigation';
    default:
      if (behavior.title) {
        return truncateText(behavior.title, 80);
      }
      if (label) {
        return truncateText(`${type || 'Test'}: ${label}`, 80);
      }
      return truncateText('Verify page interaction', 80);
  }
}

module.exports = {
  truncateText,
  createShortSuggestionTitle,
  shortNavigationTitle,
  pathFromUrl,
};
