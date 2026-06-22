const ELEMENT_NOT_FOUND_MESSAGE =
  'We could not find the selected element anymore. The page may have changed or the selector is unstable.';

const ELEMENT_NOT_FOUND_RECOMMENDATION =
  'Reopen the visual picker and select the element again. For best stability, add a data-testid attribute to this element.';

function uniquePlans(plans) {
  const seen = new Set();
  return plans.filter((plan) => {
    const key = `${plan.strategy}:${plan.selector}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAttemptPlans(stepDef) {
  const plans = [];

  if (stepDef.selector) {
    plans.push({
      strategy: 'primary',
      selector: stepDef.selector,
      type: stepDef.selector.startsWith('text=') ? 'text-prefix' : 'css',
    });
  }

  for (const alternative of stepDef.selectorAlternatives || []) {
    if (!alternative || alternative === stepDef.selector) continue;
    plans.push({
      strategy: 'alternative',
      selector: alternative,
      type: alternative.startsWith('text=') ? 'text-prefix' : 'css',
    });
  }

  const targetText = stepDef.targetText || stepDef.text;
  if (targetText) {
    plans.push({
      strategy: 'text',
      selector: targetText,
      type: 'text',
    });
  }

  if (stepDef.targetRole) {
    plans.push({
      strategy: 'role',
      selector: stepDef.targetLabel
        ? `${stepDef.targetRole} "${stepDef.targetLabel}"`
        : stepDef.targetRole,
      type: 'role',
      role: stepDef.targetRole,
      name: stepDef.targetLabel || stepDef.targetText || stepDef.elementLabel || undefined,
    });
  }

  const ariaLabel = stepDef.targetLabel || stepDef.elementLabel;
  if (ariaLabel) {
    plans.push({
      strategy: 'aria-label',
      selector: ariaLabel,
      type: 'aria-label',
      label: ariaLabel,
    });
  }

  return uniquePlans(plans);
}

async function resolveLocator(page, plan) {
  switch (plan.type) {
    case 'css':
      return page.locator(plan.selector).first();
    case 'text-prefix':
      return page.getByText(plan.selector.slice(5), { exact: false }).first();
    case 'text':
      return page.getByText(plan.selector, { exact: false }).first();
    case 'role':
      return plan.name
        ? page.getByRole(plan.role, { name: plan.name, exact: false }).first()
        : page.getByRole(plan.role).first();
    case 'aria-label': {
      const byLabel = page.getByLabel(plan.label, { exact: false }).first();
      if ((await byLabel.count()) > 0) return byLabel;
      return page.locator(`[aria-label="${plan.label.replace(/"/g, '\\"')}"]`).first();
    }
    default:
      return null;
  }
}

async function resolveElementTarget(page, stepDef, options = {}) {
  const { action = 'click', timeoutMs = 8000, requireVisible = true } = options;
  const plans = buildAttemptPlans(stepDef);
  const attempts = [];

  if (plans.length === 0) {
    return {
      failed: true,
      attempts: [
        {
          strategy: 'primary',
          selector: stepDef.selector || '',
          status: 'failed',
          error: 'No selector or target metadata provided.',
        },
      ],
    };
  }

  const perAttemptTimeout = Math.max(1200, Math.floor(timeoutMs / plans.length));

  for (const plan of plans) {
    const attempt = {
      strategy: plan.strategy,
      selector: plan.selector,
      status: 'failed',
      error: null,
    };

    try {
      const locator = await resolveLocator(page, plan);
      if (!locator || (await locator.count()) === 0) {
        attempt.error = 'Element not found';
        attempts.push(attempt);
        continue;
      }

      if (requireVisible) {
        const visible = await locator.isVisible({ timeout: perAttemptTimeout }).catch(() => false);
        if (!visible) {
          attempt.error = 'Element not visible';
          attempts.push(attempt);
          continue;
        }
      }

      if (action === 'fill') {
        const editable = await locator.isEditable({ timeout: 1000 }).catch(() => false);
        if (!editable) {
          attempt.error = 'Element not editable';
          attempts.push(attempt);
          continue;
        }
      }

      attempt.status = 'passed';
      attempts.push(attempt);
      return {
        locator,
        selectorUsed: plan.selector,
        selectorStrategy: plan.strategy,
        attempts,
      };
    } catch (error) {
      attempt.error = error.message || 'Element not found';
      attempts.push(attempt);
    }
  }

  return { failed: true, attempts };
}

function passedStepMessage(stepDef, resolution) {
  const target = stepDef.elementLabel || stepDef.targetLabel || stepDef.label || 'element';
  if (resolution.selectorStrategy === 'primary') {
    return `${target}`;
  }
  return `Used ${strategyLabel(resolution.selectorStrategy)} for ${target}`;
}

function strategyLabel(strategy) {
  switch (strategy) {
    case 'alternative':
      return 'a backup selector';
    case 'text':
      return 'visible text';
    case 'role':
      return 'element role';
    case 'aria-label':
      return 'aria label';
    default:
      return 'a fallback selector';
  }
}

function formatAttemptsForDevDetails(attempts) {
  return JSON.stringify({ attempts }, null, 2);
}

module.exports = {
  ELEMENT_NOT_FOUND_MESSAGE,
  ELEMENT_NOT_FOUND_RECOMMENDATION,
  buildAttemptPlans,
  resolveElementTarget,
  passedStepMessage,
  strategyLabel,
  formatAttemptsForDevDetails,
};
