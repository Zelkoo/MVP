function looksDynamic(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  if (/^[a-f0-9-]{16,}$/i.test(trimmed)) return true;
  if (/^(ember|react-|mui-|css-|ng-|jsx-|_|[a-z]{1,2}\d{5,})/i.test(trimmed)) return true;
  if (/^\d+$/.test(trimmed)) return true;
  if (/\d{5,}/.test(trimmed) && trimmed.length < 24) return true;
  if (/^:r[0-9a-z]+:$/i.test(trimmed)) return true;

  return false;
}

function escapeAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeCssIdentifier(value) {
  return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function getElementLabel(element) {
  const text = (element.text || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const ariaLabel = (element.ariaLabel || '').trim();
  const placeholder = (element.placeholder || '').trim();
  const name = (element.name || '').trim();
  const id = (element.id || '').trim();
  const type = (element.type || '').trim();

  if (text) return text;
  if (ariaLabel) return ariaLabel;
  if (placeholder) return placeholder;
  if (name) return name;
  if (id && !looksDynamic(id)) return id;
  if (type && element.tagName) return `${element.tagName} (${type})`;
  if (element.tagName) return element.tagName;
  return 'Element';
}

function suggestActionTypes(element) {
  const tag = (element.tagName || '').toLowerCase();
  const role = (element.role || '').toLowerCase();
  const type = (element.type || '').toLowerCase();

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return ['fill', 'expectVisible'];
  }
  if (type === 'email' || type === 'text' || type === 'search' || type === 'tel') {
    return ['fill', 'expectVisible'];
  }
  if (tag === 'button' || tag === 'a' || role === 'button' || role === 'link') {
    return ['click', 'expectVisible'];
  }
  return ['click', 'expectVisible'];
}

function generateBestSelector(element) {
  const alternatives = [];
  const tag = (element.tagName || 'div').toLowerCase();
  const text = (element.text || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const role = (element.role || '').toLowerCase();
  const type = (element.type || '').toLowerCase();

  if (element.testId) {
    alternatives.push(`[data-testid="${escapeAttr(element.testId)}"]`);
  }
  if (element.dataCy) {
    alternatives.push(`[data-cy="${escapeAttr(element.dataCy)}"]`);
  }
  if (element.dataTest) {
    alternatives.push(`[data-test="${escapeAttr(element.dataTest)}"]`);
  }
  if (element.ariaLabel) {
    alternatives.push(`[aria-label="${escapeAttr(element.ariaLabel)}"]`);
  }
  if (element.name) {
    alternatives.push(`${tag}[name="${escapeAttr(element.name)}"]`);
  }
  if (element.id && !looksDynamic(element.id)) {
    alternatives.push(`#${escapeCssIdentifier(element.id)}`);
  }
  if (role && text) {
    alternatives.push(`${tag}[role="${escapeAttr(role)}"]`);
  }
  if ((tag === 'button' || tag === 'a' || role === 'button' || role === 'link') && text) {
    alternatives.push(`text=${text}`);
  }
  if (tag === 'input' && type) {
    alternatives.push(`input[type="${escapeAttr(type)}"]`);
  }
  if (element.placeholder) {
    alternatives.push(`${tag}[placeholder="${escapeAttr(element.placeholder)}"]`);
  }
  if (element.stableClasses?.length) {
    alternatives.push(`${tag}.${element.stableClasses.map(escapeCssIdentifier).join('.')}`);
  }
  if (element.href && tag === 'a') {
    try {
      const hrefPath = new URL(element.href, 'https://example.com').pathname;
      if (hrefPath && hrefPath !== '/') {
        alternatives.push(`a[href="${escapeAttr(hrefPath)}"]`);
      }
    } catch {
      // ignore invalid href
    }
  }

  const unique = [...new Set(alternatives.filter(Boolean))];

  let selector = unique[0] || tag;
  let confidence = 0.55;

  if (element.testId) {
    selector = `[data-testid="${escapeAttr(element.testId)}"]`;
    confidence = 0.95;
  } else if (element.dataCy) {
    selector = `[data-cy="${escapeAttr(element.dataCy)}"]`;
    confidence = 0.93;
  } else if (element.dataTest) {
    selector = `[data-test="${escapeAttr(element.dataTest)}"]`;
    confidence = 0.91;
  } else if (element.ariaLabel) {
    selector = `[aria-label="${escapeAttr(element.ariaLabel)}"]`;
    confidence = 0.88;
  } else if (element.name) {
    selector = `${tag}[name="${escapeAttr(element.name)}"]`;
    confidence = 0.85;
  } else if (element.id && !looksDynamic(element.id)) {
    selector = `#${escapeCssIdentifier(element.id)}`;
    confidence = 0.82;
  } else if (text && (tag === 'button' || tag === 'a' || role === 'button' || role === 'link')) {
    selector = `text=${text}`;
    confidence = 0.78;
  } else if (element.placeholder && (tag === 'input' || tag === 'textarea')) {
    selector = `${tag}[placeholder="${escapeAttr(element.placeholder)}"]`;
    confidence = 0.72;
  } else if (element.stableClasses?.length) {
    selector = `${tag}.${element.stableClasses.map(escapeCssIdentifier).join('.')}`;
    confidence = 0.6;
  }

  return {
    selector,
    alternatives: unique.length ? unique : [selector],
    confidence,
  };
}

module.exports = {
  looksDynamic,
  escapeAttr,
  getElementLabel,
  suggestActionTypes,
  generateBestSelector,
};
