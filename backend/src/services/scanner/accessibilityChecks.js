async function runAccessibilityChecks(page, pageTitle) {
  const domIssues = await page.evaluate(() => {
    const issues = [];

    function add(severity, message, details, source) {
      issues.push({
        type: 'accessibility',
        severity,
        message,
        details,
        source,
      });
    }

    const htmlLang = document.documentElement.getAttribute('lang');
    if (!htmlLang || !htmlLang.trim()) {
      add(
        'warning',
        'Missing document lang attribute',
        '<html> element should include a lang attribute for screen readers and SEO.',
        'html'
      );
    }

    const title = document.title?.trim();
    if (!title) {
      add(
        'warning',
        'Missing page title',
        'Document has no <title> element content.',
        'document.title'
      );
    }

    const idMap = new Map();
    document.querySelectorAll('[id]').forEach((element) => {
      const id = element.id.trim();
      if (!id) return;
      if (idMap.has(id)) {
        add(
          'warning',
          'Duplicate ID attribute',
          `Duplicate id="${id}" found on multiple elements.`,
          `#${id}`
        );
      } else {
        idMap.set(id, element);
      }
    });

    document.querySelectorAll('img').forEach((img) => {
      const alt = img.getAttribute('alt');
      if (alt === null || alt.trim() === '') {
        add(
          'warning',
          'Image missing alt attribute',
          img.src || '(inline image)',
          img.src || 'img'
        );
      }
    });

    document.querySelectorAll('button, [role="button"]').forEach((btn) => {
      const text = (btn.innerText || btn.textContent || '').replace(/\s+/g, ' ').trim();
      const ariaLabel = btn.getAttribute('aria-label');
      const ariaLabelledby = btn.getAttribute('aria-labelledby');
      if (!text && !ariaLabel && !ariaLabelledby) {
        add(
          'warning',
          'Button without visible text or aria-label',
          btn.outerHTML.slice(0, 200),
          'button'
        );
      }
    });

    document.querySelectorAll('input, textarea, select').forEach((input) => {
      const type = (input.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');
      const placeholder = input.getAttribute('placeholder');
      const name = input.getAttribute('name');

      if (!hasLabel && !ariaLabel && !ariaLabelledby && !placeholder && !name) {
        add(
          'warning',
          'Form field missing label, aria-label, name, or placeholder',
          input.outerHTML.slice(0, 200),
          input.name || input.id || 'form-field'
        );
      }
    });

    document.querySelectorAll('a[href]').forEach((anchor) => {
      const text = (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      const ariaLabel = anchor.getAttribute('aria-label');
      const imgAlt = anchor.querySelector('img')?.getAttribute('alt');
      if (!text && !ariaLabel && !imgAlt) {
        add('warning', 'Link without visible text', anchor.href, anchor.href);
      }
    });

    return issues;
  });

  if (!pageTitle?.trim()) {
    const hasTitleIssue = domIssues.some((issue) => issue.message === 'Missing page title');
    if (!hasTitleIssue) {
      domIssues.push({
        type: 'accessibility',
        severity: 'warning',
        message: 'Missing page title',
        details: 'Playwright could not read a document title after navigation.',
        source: 'document.title',
      });
    }
  }

  return domIssues;
}

module.exports = { runAccessibilityChecks };
