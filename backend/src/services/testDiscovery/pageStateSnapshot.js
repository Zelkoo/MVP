const crypto = require('crypto');

const CAPTURE_PAGE_STATE_SCRIPT = () => {
  function visibleText(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  function hiddenDescendantInfo(el) {
    let hiddenCount = 0;
    let hiddenText = '';
    for (const child of Array.from(el.querySelectorAll('*'))) {
      const style = window.getComputedStyle(child);
      const text = visibleText(child);
      if (!text || text.length < 2) continue;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        hiddenCount += 1;
        if (!hiddenText) hiddenText = text.slice(0, 80);
      }
    }
    return { hiddenCount, hiddenText };
  }

  function associatedLabel(el) {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return visibleText(labelEl).replace(/:$/, '').trim();
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return visibleText(label).replace(/:$/, '').trim();
    }

    let node = el.previousSibling;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').trim().replace(/:$/, '').trim();
        if (text) return text;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName?.toLowerCase();
        if (tag === 'label') return visibleText(node).replace(/:$/, '').trim();
        const text = visibleText(node).replace(/:$/, '').trim();
        if (text && text.length <= 48) return text;
      }
      node = node.previousSibling;
    }

    const parentText = visibleText(el.parentElement || el)
      .replace(visibleText(el), '')
      .replace(/:$/, '')
      .trim();
    if (parentText && parentText.length <= 48) return parentText.split(/\s+/).slice(0, 4).join(' ');

    return '';
  }

  function domIndex(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      return Array.from(document.querySelectorAll('input')).indexOf(el);
    }
    if (tag === 'textarea') {
      return Array.from(document.querySelectorAll('textarea')).indexOf(el);
    }
    if (tag === 'select') {
      return Array.from(document.querySelectorAll('select')).indexOf(el);
    }
    if (tag === 'button') {
      return Array.from(document.querySelectorAll('button')).indexOf(el);
    }
    return Array.from(document.querySelectorAll(tag)).indexOf(el);
  }

  function signature(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const role = el.getAttribute('role') || '';
    const type = (el.getAttribute('type') || '').toLowerCase();
    const name = el.getAttribute('name') || '';
    const label = associatedLabel(el).slice(0, 40);
    const index = domIndex(el);
    return `${tag}|${id}|${type}|${name}|${label}|${index}`;
  }

  function buildSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ['data-testid', 'data-cy', 'data-test', 'name']) {
      const value = el.getAttribute(attr);
      if (value) return `[${attr}="${value}"]`;
    }

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const index = domIndex(el);

    if (tag === 'input' && index >= 0) {
      if (type && type !== 'text') {
        return `input[type="${type}"] >> nth=${Array.from(document.querySelectorAll(`input[type="${type}"]`)).indexOf(el)}`;
      }
      return `input >> nth=${index}`;
    }

    if (tag === 'textarea' && index >= 0) {
      return `textarea >> nth=${index}`;
    }

    if (tag === 'select' && index >= 0) {
      return `select >> nth=${index}`;
    }

    const className = (el.className || '').toString().trim();
    if (className) {
      const primary = className.split(/\s+/).filter(Boolean)[0];
      if (primary) {
        const matches = document.querySelectorAll(`.${CSS.escape(primary)}`);
        if (matches.length > 0 && matches.length <= 12) {
          const index = Array.from(matches).indexOf(el);
          if (index >= 0) {
            return `.${CSS.escape(primary)} >> nth=${index}`;
          }
        }
      }
    }

    const directText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => (node.textContent || '').trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    if (directText && directText.length <= 40) return `text=${directText}`;

    const text = visibleText(el);
    if (text && text.length <= 40 && el.children.length === 0) return `text=${text}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    return el.tagName.toLowerCase();
  }

  function buildAlternatives(el) {
    const alts = [];
    if (el.id) alts.push(`#${CSS.escape(el.id)}`);
    const testId = el.getAttribute('data-testid');
    if (testId) alts.push(`[data-testid="${testId}"]`);
    const aria = el.getAttribute('aria-label');
    if (aria) alts.push(`[aria-label="${aria}"]`);
    const className = (el.className || '').toString().trim();
    if (className) {
      const primary = className.split(/\s+/).filter(Boolean)[0];
      if (primary) alts.push(`.${CSS.escape(primary)}`);
    }
    const label = associatedLabel(el);
    if (label) alts.push(`text=${label}`);
    return [...new Set(alts)];
  }

  function humanLabel(el) {
    const label = associatedLabel(el);
    if (label) return label;
    const hiddenInfo = hiddenDescendantInfo(el);
    if (hiddenInfo.hiddenText) return hiddenInfo.hiddenText.slice(0, 60);
    const heading = el.querySelector('h1,h2,h3,h4,h5,h6');
    if (heading) return visibleText(heading);
    return (
      el.getAttribute('aria-label') ||
      visibleText(el) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      el.getAttribute('title') ||
      el.tagName.toLowerCase()
    );
  }

  const selectors = [
    'button',
    'figure',
    'figcaption',
    'article',
    'img',
    '[class*="card"]',
    '[class*="figure"]',
    '[class*="tile"]',
    '[class*="item"]',
    '[class*="avatar"]',
    '[class*="profile"]',
    '[class*="product"]',
    '[class*="menu"]',
    'a[href]',
    'input',
    'textarea',
    'select',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="menuitem"]',
    '[role="dialog"]',
    '[role="alert"]',
    '[role="status"]',
    '[onclick]',
    '[aria-expanded]',
    '[data-testid]',
    '[data-cy]',
    '[data-test]',
  ].join(',');

  const elements = [];
  for (const el of Array.from(document.querySelectorAll(selectors))) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const hiddenInfo = hiddenDescendantInfo(el);
    elements.push({
      signature: signature(el),
      tagName: el.tagName.toLowerCase(),
      type: (el.getAttribute('type') || '').toLowerCase(),
      text: visibleText(el),
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      classes: (el.className || '').toString().slice(0, 120),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      href: el.getAttribute('href') || '',
      checked: Boolean(el.checked),
      value: el.value || '',
      selectedIndex: el.selectedIndex,
      ariaExpanded: el.getAttribute('aria-expanded'),
      ariaHidden: el.getAttribute('aria-hidden'),
      ariaChecked: el.getAttribute('aria-checked'),
      disabled: Boolean(el.disabled),
      selector: buildSelector(el),
      selectorAlternatives: buildAlternatives(el),
      humanLabel: humanLabel(el),
      associatedLabel: associatedLabel(el),
      domIndex: domIndex(el),
      computedStyle: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      },
      hiddenDescendantCount: hiddenInfo.hiddenCount,
      hiddenDescendantText: hiddenInfo.hiddenText,
      hoverPotential: hiddenInfo.hiddenCount > 0 || ['figure', 'img', 'article'].includes(el.tagName.toLowerCase()),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }

  const forms = Array.from(document.querySelectorAll('form')).map((form) => ({
    action: form.getAttribute('action') || '',
    method: (form.getAttribute('method') || 'get').toLowerCase(),
    fieldCount: form.querySelectorAll('input, textarea, select').length,
  }));

  const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const visibleTexts = bodyText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 40);

  const keyboardResponseLikely = elements.some(
    (el) =>
      ['input', 'textarea'].includes(el.tagName) &&
      !['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type)
  );

  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .map((heading) => visibleText(heading))
    .filter(Boolean)
    .slice(0, 8);

  const loadingSelector =
    '[aria-busy="true"], .loading, .loader, .spinner, .skeleton, .progress, [class*="loading"], [class*="spinner"], [class*="skeleton"]';
  const loadingIndicatorCount = document.querySelectorAll(loadingSelector).length;
  const documentBusy = Boolean(document.querySelector('[aria-busy="true"]'));

  return {
    url: window.location.href,
    title: document.title || '',
    elementCount: document.querySelectorAll('*').length,
    formCount: forms.length,
    visibleTextSample: bodyText.slice(0, 500),
    visibleTexts,
    visibleTextHash: '',
    forms,
    elements,
    headings,
    loadingIndicatorCount,
    documentBusy,
    keyboardResponseLikely,
    dialogs: elements.filter((el) => el.role === 'dialog'),
    alerts: elements.filter((el) => el.role === 'alert' || el.role === 'status'),
  };
};

function normalizeVisibleText(text) {
  return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hashVisibleText(text) {
  return crypto.createHash('sha256').update(normalizeVisibleText(text)).digest('hex').slice(0, 16);
}

async function capturePageState(page) {
  const state = await page.evaluate(CAPTURE_PAGE_STATE_SCRIPT);
  state.visibleTextHash = hashVisibleText(state.visibleTextSample);
  return state;
}

async function captureDomSnapshot(page) {
  return capturePageState(page);
}

function getInteractiveElements(snapshot) {
  return snapshot.elements || [];
}

function getFormsSnapshot(snapshot) {
  return snapshot.forms || [];
}

function getControlStates(snapshot) {
  return (snapshot.elements || []).filter((el) =>
    ['input', 'select', 'textarea'].includes(el.tagName) ||
    ['checkbox', 'radio', 'switch'].includes(el.role)
  );
}

module.exports = {
  capturePageState,
  captureDomSnapshot,
  normalizeVisibleText,
  getInteractiveElements,
  getFormsSnapshot,
  getControlStates,
  hashVisibleText,
};
