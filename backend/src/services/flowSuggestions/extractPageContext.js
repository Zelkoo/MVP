const { generateBestSelector, getElementLabel } = require('../pageInspector/selectorHelpers');

const PAGE_CONTEXT_SCRIPT = () => {
  const viewportHeight = window.innerHeight;

  function visibleText(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > viewportHeight) return false;
    return true;
  }

  function fieldHints(el) {
    const tagName = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    let labelText = '';

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) labelText = visibleText(label).toLowerCase();
    }

    const parentLabel = el.closest('label');
    if (parentLabel) labelText = visibleText(parentLabel).toLowerCase();

    const combined = [name, id, placeholder, ariaLabel, labelText, autocomplete, type, tagName].join(' ');
    return { tagName, type, name: el.getAttribute('name') || '', id: el.id || '', placeholder: el.getAttribute('placeholder') || '', ariaLabel: el.getAttribute('aria-label') || '', labelText, combined };
  }

  function classifyField(el) {
    const hints = fieldHints(el);
    const combined = hints.combined;

    if (hints.type === 'email' || /email|e-mail/.test(combined)) return 'email';
    if (/phone|tel|mobile/.test(combined)) return 'phone';
    if (hints.tagName === 'textarea' || /message|comment|notes|inquiry|body/.test(combined)) return 'message';
    if (/company|organization|organisation|business/.test(combined)) return 'company';
    if (/name|full.?name|first.?name|last.?name|fname|lname/.test(combined)) return 'name';
    return 'unknown';
  }

  function ariaRole(el) {
    const explicit = (el.getAttribute('role') || '').toLowerCase();
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') return 'textbox';
    if (tag === 'select') return 'combobox';
    return '';
  }

  function serializeField(el) {
    const rect = el.getBoundingClientRect();
    const hints = fieldHints(el);
    return {
      fieldType: classifyField(el),
      tagName: hints.tagName,
      type: hints.type,
      name: hints.name,
      id: hints.id,
      placeholder: hints.placeholder,
      ariaLabel: hints.ariaLabel,
      labelText: hints.labelText,
      role: ariaRole(el),
      text: visibleText(el),
      testId: el.getAttribute('data-testid') || '',
      dataTest: el.getAttribute('data-test') || '',
      dataCy: el.getAttribute('data-cy') || '',
      stableClasses: Array.from(el.classList || []).slice(0, 3),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function serializeButton(el) {
    const rect = el.getBoundingClientRect();
    return {
      tagName: el.tagName.toLowerCase(),
      text: visibleText(el),
      type: (el.getAttribute('type') || '').toLowerCase(),
      name: el.getAttribute('name') || '',
      id: el.id || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      placeholder: '',
      href: el.getAttribute('href') || '',
      role: ariaRole(el),
      testId: el.getAttribute('data-testid') || '',
      dataTest: el.getAttribute('data-test') || '',
      dataCy: el.getAttribute('data-cy') || '',
      stableClasses: Array.from(el.classList || []).slice(0, 3),
      boundingBox: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function findSubmitControl(form) {
    const candidates = Array.from(
      form.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')
    ).filter(isVisible);

    const scored = candidates.map((el) => {
      const text = visibleText(el).toLowerCase();
      let score = 0;
      if (el.matches('button[type="submit"], input[type="submit"]')) score += 3;
      if (/send|submit|contact|message|request|apply/.test(text)) score += 2;
      if (text) score += 1;
      return { el, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.el || null;
  }

  const forms = [];
  for (const form of Array.from(document.querySelectorAll('form'))) {
    const fields = Array.from(form.querySelectorAll('input, textarea, select'))
      .filter((el) => {
        const type = (el.getAttribute('type') || '').toLowerCase();
        return !['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type);
      })
      .filter(isVisible)
      .map(serializeField);

    const submit = findSubmitControl(form);
    if (fields.length === 0 && !submit) continue;

    forms.push({
      fields,
      submit: submit ? serializeButton(submit) : null,
      nearbyText: visibleText(form).toLowerCase().slice(0, 200),
    });
  }

  const interactive = Array.from(
    document.querySelectorAll('a[href], button, input, textarea, [role="button"], [role="link"]')
  )
    .filter(isVisible)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        text: visibleText(el),
        type: (el.getAttribute('type') || '').toLowerCase(),
        name: el.getAttribute('name') || '',
        id: el.id || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        placeholder: el.getAttribute('placeholder') || '',
        href: el.getAttribute('href') || '',
        role: ariaRole(el),
        testId: el.getAttribute('data-testid') || '',
        dataTest: el.getAttribute('data-test') || '',
        dataCy: el.getAttribute('data-cy') || '',
        stableClasses: Array.from(el.classList || []).slice(0, 3),
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });

  return { forms, interactive };
};

function toDetectedElement(role, raw) {
  const { selector, alternatives } = generateBestSelector(raw);
  return {
    role,
    ariaRole: raw.role || '',
    label: getElementLabel(raw),
    selector,
    alternatives,
  };
}

async function extractPageContext(page) {
  const raw = await page.evaluate(PAGE_CONTEXT_SCRIPT);
  const forms = raw.forms.map((form) => ({
    fields: form.fields.map((field) => ({
      ...field,
      detected: toDetectedElement(`${field.fieldType}-input`, field),
    })),
    submit: form.submit ? toDetectedElement('submit-button', form.submit) : null,
    nearbyText: form.nearbyText,
  }));

  const interactive = raw.interactive.map((item, index) => ({
    ...item,
    id: `interactive-${index}`,
    detected: toDetectedElement('interactive', item),
  }));

  return { forms, interactive };
}

module.exports = {
  extractPageContext,
  toDetectedElement,
};
