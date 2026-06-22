const SUCCESS_TEXT_KEYWORDS = [
  'thank you',
  'thanks',
  'success',
  'sent',
  'submitted',
  'subscribed',
  'added to cart',
  'added to basket',
  'checkout',
  'confirmed',
  'received',
  'done',
  'complete',
  'welcome',
];

const CAPTURE_PAGE_STATE_SCRIPT = () => {
  function visibleText(el) {
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160);
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  }

  function elementSignature(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const role = el.getAttribute('role') || '';
    const testId = el.getAttribute('data-testid') || '';
    const text = visibleText(el).slice(0, 60);
    return `${tag}|${id}|${role}|${testId}|${text}`;
  }

  function buildSelector(el) {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${testId}"]`;
    const aria = el.getAttribute('aria-label');
    if (aria) return `[aria-label="${aria.replace(/"/g, '\\"')}"]`;
    const text = visibleText(el);
    if (text && text.length <= 40) return `text=${text}`;
    const tag = el.tagName.toLowerCase();
    const cls = Array.from(el.classList || [])
      .filter((name) => name && !/^ng-|^css-|^jsx-/.test(name))
      .slice(0, 2)
      .join('.');
    return cls ? `${tag}.${cls}` : tag;
  }

  const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"]'))
    .filter(isVisible)
    .map((el) => visibleText(el))
    .filter(Boolean);

  const bodyText = (document.body?.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  const visibleTexts = Array.from(
    new Set(
      [
        ...headings,
        ...Array.from(document.querySelectorAll('p, li, span, div, label, button, a'))
          .filter(isVisible)
          .map((el) => visibleText(el))
          .filter((text) => text.length >= 4 && text.length <= 120),
      ].slice(0, 80)
    )
  );

  const visibleElements = Array.from(
    document.querySelectorAll(
      'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="alert"], [role="status"], h1, h2, h3'
    )
  )
    .filter(isVisible)
    .slice(0, 60)
    .map((el) => ({
      signature: elementSignature(el),
      tagName: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      label: visibleText(el) || el.getAttribute('aria-label') || el.getAttribute('name') || el.tagName.toLowerCase(),
      selector: buildSelector(el),
      disabled: Boolean(el.disabled),
      href: el.getAttribute('href') || '',
    }));

  const forms = Array.from(document.querySelectorAll('form'))
    .filter(isVisible)
    .map((form) => {
      const fields = Array.from(form.querySelectorAll('input, textarea, select')).filter(isVisible);
      return {
        fieldCount: fields.length,
        filledCount: fields.filter((field) => {
          const value = field.value || field.textContent || '';
          return String(value).trim().length > 0;
        }).length,
        visible: true,
      };
    });

  const toastSelector =
    '[role="alert"], [role="status"], .toast, .snackbar, .notification, .alert, [class*="toast"], [class*="snackbar"]';

  const toasts = Array.from(document.querySelectorAll(toastSelector))
    .filter(isVisible)
    .map((el) => ({
      signature: elementSignature(el),
      text: visibleText(el),
      selector: buildSelector(el),
      role: el.getAttribute('role') || 'alert',
    }));

  const cartCandidates = Array.from(
    document.querySelectorAll('[class*="cart"], [id*="cart"], [aria-label*="cart" i], [data-testid*="cart"]')
  )
    .filter(isVisible)
    .map((el) => visibleText(el))
    .filter((text) => /\d/.test(text) || /cart|basket|bag/i.test(text));

  const cartMatch = cartCandidates
    .map((text) => {
      const match = text.match(/(\d+)/);
      return match ? Number(match[1]) : null;
    })
    .find((value) => value != null);

  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
    .filter(isVisible)
    .slice(0, 30)
    .map((el) => ({
      signature: elementSignature(el),
      label: visibleText(el) || el.getAttribute('aria-label') || 'button',
      disabled: Boolean(el.disabled),
      selector: buildSelector(el),
    }));

  return {
    url: window.location.href,
    title: document.title || '',
    visibleTexts,
    visibleElements,
    forms,
    toasts,
    buttons,
    cartCount: cartMatch ?? null,
    bodyTextSample: bodyText.slice(0, 1200),
  };
};

async function capturePageState(page) {
  return page.evaluate(CAPTURE_PAGE_STATE_SCRIPT);
}

module.exports = {
  capturePageState,
  SUCCESS_TEXT_KEYWORDS,
};
