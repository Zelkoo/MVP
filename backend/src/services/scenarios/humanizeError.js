const { stepLabel } = require('../scenarios/flowSteps');

function humanizeStepError(stepDef, error, timeoutMs = 8000) {
  const technical = error.message || String(error);
  const timeoutSec = Math.round(timeoutMs / 1000);
  const target =
    stepDef.elementLabel ||
    stepDef.text ||
    stepDef.label ||
    stepDef.selector ||
    'the element';

  switch (stepDef.action) {
    case 'click': {
      if (/timeout|waiting for|not visible|not clickable|intercepts pointer/i.test(technical)) {
        return `Could not click '${target}'. The element was not visible or not clickable within ${timeoutSec} seconds.`;
      }
      if (/not found/i.test(technical)) {
        return `Could not find '${target}' on the page to click.`;
      }
      return `Could not click '${target}'. ${technical}`;
    }
    case 'fill': {
      if (/timeout|waiting for|not visible|not editable/i.test(technical)) {
        return `Could not fill '${target}'. The input was not visible or editable within ${timeoutSec} seconds.`;
      }
      if (/not found/i.test(technical)) {
        return `Could not find the input '${target}' on the page.`;
      }
      return `Could not fill '${target}'. ${technical}`;
    }
    case 'waitForText': {
      const text = stepDef.text || 'expected text';
      if (/timeout|waiting for/i.test(technical)) {
        return `Timed out waiting for text '${text}' to appear within ${timeoutSec} seconds.`;
      }
      return `Could not find text '${text}' on the page.`;
    }
    case 'expectUrlContains': {
      const fragment = stepDef.value || '';
      return `Expected the URL to contain '${fragment}', but it did not. Current URL: ${technical.match(/https?:\/\/[^\s"]+/)?.[0] || 'see developer details'}.`;
    }
    case 'expectVisible': {
      if (/timeout|waiting for|not visible/i.test(technical)) {
        return `Expected '${target}' to be visible, but it was not within ${timeoutSec} seconds.`;
      }
      if (/not found/i.test(technical)) {
        return `Could not find '${target}' on the page.`;
      }
      return `Expected '${target}' to be visible. ${technical}`;
    }
    case 'goto': {
      if (/timeout|net::|ERR_/i.test(technical)) {
        return `Could not open the page within ${timeoutSec} seconds. Check the URL and try again.`;
      }
      return `Could not navigate to the page. ${technical}`;
    }
    case 'expectNetworkSuccess': {
      return `Expected a successful server response (2xx), but none was detected within ${timeoutSec} seconds.`;
    }
    default:
      return technical;
  }
}

module.exports = { humanizeStepError };
