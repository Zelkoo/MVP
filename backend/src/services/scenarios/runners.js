const { ConsoleTracker } = require('../scanner/consoleTracker');
const { findBrokenLinks } = require('../scanner/linkChecker');
const {
  createRunState,
  addStep,
  addIssue,
  computeScenarioScore,
  resolveStatus,
  captureScreenshot,
  withScenarioBrowser,
  openPage,
  findBySelectorOrText,
  buildSummary,
} = require('./base');
const { DEFAULT_BROKEN_LINK_LIMIT, NAVIGATION_TIMEOUT_MS } = require('./constants');

async function runContactForm(scenario) {
  const config = scenario.config || {};
  const fields = config.fields || {};
  const submitSelector = config.submitSelector || 'button[type="submit"], input[type="submit"]';
  const success = config.success || { type: 'text', value: 'thank' };

  return withScenarioBrowser({}, async (context) => {
    const state = createRunState('contact-form');
    const consoleTracker = new ConsoleTracker();
    let page = null;

    try {
      const opened = await openPage(context, scenario.startUrl, consoleTracker);
      page = opened.page;

      if (opened.error) {
        addStep(state, 'Open start URL', 'failed', opened.error, opened.durationMs);
        addIssue(state, {
          type: 'validation',
          severity: 'critical',
          message: 'Could not open contact page',
          details: opened.error,
          recommendation: 'Verify the start URL is reachable and not blocked.',
        });
      } else {
        addStep(state, 'Open start URL', 'passed', opened.finalUrl, opened.durationMs);
      }

      if (page && !opened.error) {
        const fieldMap = [
          ['name', fields.name],
          ['email', fields.email],
          ['message', fields.message],
        ];

        for (const [label, fieldConfig] of fieldMap) {
          if (!fieldConfig?.selector) continue;
          try {
            await page.fill(fieldConfig.selector, fieldConfig.value || `Test ${label}`);
            addStep(state, `Fill ${label} field`, 'passed', fieldConfig.selector);
          } catch (error) {
            addStep(state, `Fill ${label} field`, 'failed', error.message);
            addIssue(state, {
              type: 'validation',
              severity: 'critical',
              message: `Could not fill ${label} field`,
              details: error.message,
              recommendation: `Check the selector for the ${label} field in scenario config.`,
            });
          }
        }

        let submitResponse = null;
        try {
          const [response] = await Promise.all([
            page.waitForResponse(
              (res) => res.request().method() === 'POST' || res.request().method() === 'PUT',
              { timeout: 8000 }
            ).catch(() => null),
            page.click(submitSelector, { timeout: 8000 }),
          ]);
          submitResponse = response;
          addStep(state, 'Submit contact form', 'passed', submitSelector);
        } catch (error) {
          addStep(state, 'Submit contact form', 'failed', error.message);
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: 'Could not submit contact form',
            details: error.message,
            recommendation: 'Verify the submit button selector and that the form accepts test submissions.',
          });
        }

        let successPassed = false;
        const currentUrl = page.url();
        const bodyText = await page.locator('body').innerText().catch(() => '');

        if (success.type === 'url_contains' && success.value) {
          successPassed = currentUrl.toLowerCase().includes(String(success.value).toLowerCase());
        } else if (success.type === 'network_2xx' && submitResponse) {
          successPassed = submitResponse.status() >= 200 && submitResponse.status() < 300;
        } else if (success.value) {
          successPassed = bodyText.toLowerCase().includes(String(success.value).toLowerCase());
        } else {
          successPassed = /thank|success|received|submitted/i.test(bodyText);
        }

        if (successPassed) {
          addStep(state, 'Verify success condition', 'passed', success.type || 'text');
        } else {
          addStep(state, 'Verify success condition', 'failed', 'Expected success signal not detected');
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: 'Contact form success not detected',
            details: `URL: ${currentUrl}`,
            recommendation:
              'Update the success condition (URL contains, page text, or network 2xx) to match your form behavior.',
          });
        }
      }

      state.consoleErrors = consoleTracker.getDeduped();
      for (const error of state.consoleErrors) {
        addIssue(state, {
          type: 'console-error',
          severity: 'warning',
          message: 'Console error during contact form flow',
          details: error,
          recommendation: 'Fix JavaScript errors that occur when submitting the contact form.',
        });
      }

      if (page) {
        state.screenshotPath = await captureScreenshot(page, 'scenario-contact');
      }
    } catch (error) {
      addStep(state, 'Run contact form scenario', 'failed', error.message);
      addIssue(state, {
        type: 'validation',
        severity: 'critical',
        message: 'Contact form scenario error',
        details: error.message,
        recommendation: 'Review scenario configuration and try again.',
      });
    } finally {
      if (page) await page.close().catch(() => {});
    }

    const status = resolveStatus(state);
    state.summary = buildSummary(status, 'contact-form', state);
    return finalize(state, status);
  });
}

async function runCtaLink(scenario) {
  const config = scenario.config || {};

  return withScenarioBrowser({}, async (context) => {
    const state = createRunState('cta-link');
    const consoleTracker = new ConsoleTracker();
    let page = null;

    try {
      const opened = await openPage(context, scenario.startUrl, consoleTracker);
      page = opened.page;

      if (opened.error) {
        addStep(state, 'Open start URL', 'failed', opened.error, opened.durationMs);
      } else {
        addStep(state, 'Open start URL', 'passed', opened.finalUrl, opened.durationMs);
      }

      if (page && !opened.error) {
        const cta = await findBySelectorOrText(page, config.ctaSelector, config.ctaText);
        if (!cta) {
          addStep(state, 'Find CTA element', 'failed', 'CTA not found');
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: 'CTA element not found',
            recommendation: 'Provide a valid CTA selector or visible link/button text.',
          });
        } else {
          const visible = await cta.isVisible().catch(() => false);
          if (!visible) {
            addStep(state, 'Verify CTA visible', 'failed', 'CTA exists but is not visible');
            addIssue(state, {
              type: 'accessibility',
              severity: 'critical',
              message: 'CTA is not visible',
              recommendation: 'Ensure the CTA is visible without extra interaction.',
            });
          } else {
            addStep(state, 'Verify CTA visible', 'passed');
          }

          try {
            await Promise.all([
              page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {}),
              cta.click({ timeout: 8000 }),
            ]);
            addStep(state, 'Click CTA', 'passed');
          } catch (error) {
            addStep(state, 'Click CTA', 'failed', error.message);
            addIssue(state, {
              type: 'validation',
              severity: 'critical',
              message: 'Could not click CTA',
              details: error.message,
              recommendation: 'Verify the CTA is clickable and not covered by overlays.',
            });
          }

          const finalUrl = page.url();
          const bodyText = await page.locator('body').innerText().catch(() => '');
          let verified = false;

          if (config.expectedUrlContains) {
            verified = finalUrl.toLowerCase().includes(String(config.expectedUrlContains).toLowerCase());
          }
          if (!verified && config.expectedText) {
            verified = bodyText.toLowerCase().includes(String(config.expectedText).toLowerCase());
          }
          if (!verified && !config.expectedUrlContains && !config.expectedText) {
            verified = finalUrl !== opened.finalUrl;
          }

          if (verified) {
            addStep(state, 'Verify destination', 'passed', finalUrl);
          } else {
            addStep(state, 'Verify destination', 'failed', finalUrl);
            addIssue(state, {
              type: 'validation',
              severity: 'critical',
              message: 'CTA destination did not match expectations',
              details: finalUrl,
              recommendation: 'Update expected URL fragment or destination page text.',
            });
          }
        }
      }

      state.consoleErrors = consoleTracker.getDeduped();
      if (page) state.screenshotPath = await captureScreenshot(page, 'scenario-cta');
    } catch (error) {
      addStep(state, 'Run CTA scenario', 'failed', error.message);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    const status = resolveStatus(state);
    state.summary = buildSummary(status, 'cta-link', state);
    return finalize(state, status);
  });
}

async function runMobileNav(scenario) {
  const config = scenario.config || {};
  const menuSelector = config.menuButtonSelector || 'button[aria-label*="menu" i], .menu-toggle, .hamburger';
  const navSelector = config.navLinkSelector || 'nav a, [role="navigation"] a';

  return withScenarioBrowser({ viewport: { width: 390, height: 844 } }, async (context) => {
    const state = createRunState('mobile-nav');
    const consoleTracker = new ConsoleTracker();
    let page = null;

    try {
      const opened = await openPage(context, scenario.startUrl, consoleTracker);
      page = opened.page;

      if (opened.error) {
        addStep(state, 'Open start URL (mobile)', 'failed', opened.error, opened.durationMs);
      } else {
        addStep(state, 'Open start URL (mobile)', 'passed', opened.finalUrl, opened.durationMs);
      }

      if (page && !opened.error) {
        const menuButton = page.locator(menuSelector).first();
        if ((await menuButton.count()) === 0) {
          addStep(state, 'Find menu button', 'failed', menuSelector);
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: 'Mobile menu button not found',
            recommendation: 'Provide the correct menu button selector for mobile navigation.',
          });
        } else {
          addStep(state, 'Find menu button', 'passed', menuSelector);
          await menuButton.click({ timeout: 8000 });
          addStep(state, 'Open mobile menu', 'passed');

          const navLinks = page.locator(navSelector);
          const count = await navLinks.count();
          let visibleCount = 0;
          for (let i = 0; i < Math.min(count, 10); i++) {
            if (await navLinks.nth(i).isVisible().catch(() => false)) visibleCount += 1;
          }

          if (visibleCount > 0) {
            addStep(state, 'Verify navigation links visible', 'passed', `${visibleCount} link(s) visible`);
          } else {
            addStep(state, 'Verify navigation links visible', 'failed', 'No navigation links visible after opening menu');
            addIssue(state, {
              type: 'accessibility',
              severity: 'critical',
              message: 'Mobile navigation links not visible',
              recommendation: 'Check menu toggle behavior and nav link selectors on mobile viewport.',
            });
          }
        }
      }

      state.consoleErrors = consoleTracker.getDeduped();
      if (page) state.screenshotPath = await captureScreenshot(page, 'scenario-mobile-nav');
    } catch (error) {
      addStep(state, 'Run mobile nav scenario', 'failed', error.message);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    const status = resolveStatus(state);
    state.summary = buildSummary(status, 'mobile-nav', state);
    return finalize(state, status);
  });
}

async function runBrokenLinks(scenario) {
  const config = scenario.config || {};
  const maxLinks = config.maxLinks || DEFAULT_BROKEN_LINK_LIMIT;

  return withScenarioBrowser({}, async (context) => {
    const state = createRunState('broken-links');
    const consoleTracker = new ConsoleTracker();
    let page = null;

    try {
      const opened = await openPage(context, scenario.startUrl, consoleTracker);
      page = opened.page;

      if (opened.error) {
        addStep(state, 'Open start URL', 'failed', opened.error, opened.durationMs);
      } else {
        addStep(state, 'Open start URL', 'passed', opened.finalUrl, opened.durationMs);
      }

      if (page && !opened.error) {
        const brokenLinks = await findBrokenLinks(page, opened.finalUrl);
        const limited = brokenLinks.slice(0, maxLinks);
        addStep(
          state,
          'Check links',
          limited.length === 0 ? 'passed' : 'failed',
          `Checked up to ${maxLinks} links, ${limited.length} broken`
        );

        for (const link of limited) {
          addIssue(state, {
            type: 'broken-link',
            severity: 'critical',
            message: link.status
              ? `Broken ${link.scope} link (HTTP ${link.status})`
              : `Broken ${link.scope} link (unreachable)`,
            details: link.href,
            recommendation: 'Fix or remove broken links to avoid dead-end user journeys.',
          });
        }

        state.consoleErrors = consoleTracker.getDeduped();
        if (page) state.screenshotPath = await captureScreenshot(page, 'scenario-broken-links');

        const status = resolveBrokenLinksStatus(state);
        state.summary = buildSummary(status, 'broken-links', state);
        return finalize(state, status);
      }

      state.consoleErrors = consoleTracker.getDeduped();
      if (page) state.screenshotPath = await captureScreenshot(page, 'scenario-broken-links');
    } catch (error) {
      addStep(state, 'Run broken links scenario', 'failed', error.message);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    const status = resolveBrokenLinksStatus(state);
    state.summary = buildSummary(status, 'broken-links', state);
    return finalize(state, status);
  });
}

function resolveBrokenLinksStatus(state) {
  const brokenCount = state.issues.filter((i) => i.type === 'broken-link').length;
  if (state.steps.some((s) => s.status === 'failed' && s.name === 'Open start URL')) return 'failed';
  if (brokenCount === 0) return 'passed';
  if (brokenCount <= 3) return 'partial';
  return 'failed';
}

async function runCheckoutSmoke(scenario) {
  const config = scenario.config || {};
  const addToCartSelector =
    config.addToCartSelector || 'button[name="add-to-cart"], .add-to-cart, [data-testid="add-to-cart"]';

  return withScenarioBrowser({}, async (context) => {
    const state = createRunState('checkout-smoke');
    const consoleTracker = new ConsoleTracker();
    let page = null;

    try {
      const opened = await openPage(context, scenario.startUrl, consoleTracker);
      page = opened.page;

      if (opened.error) {
        addStep(state, 'Open product page', 'failed', opened.error, opened.durationMs);
      } else {
        addStep(state, 'Open product page', 'passed', opened.finalUrl, opened.durationMs);
      }

      if (page && !opened.error) {
        const beforeText = await page.locator('body').innerText().catch(() => '');
        const cartBefore = extractCartCount(beforeText, config.cartCountPattern);

        const addButton = page.locator(addToCartSelector).first();
        if ((await addButton.count()) === 0) {
          addStep(state, 'Find add-to-cart button', 'failed', addToCartSelector);
          addIssue(state, {
            type: 'validation',
            severity: 'critical',
            message: 'Add to cart button not found',
            recommendation: 'Provide the correct add-to-cart selector for your store.',
          });
        } else {
          addStep(state, 'Find add-to-cart button', 'passed', addToCartSelector);
          await addButton.click({ timeout: 8000 });
          addStep(state, 'Click add to cart', 'passed');
          await page.waitForTimeout(1500);

          const afterText = await page.locator('body').innerText().catch(() => '');
          const cartAfter = extractCartCount(afterText, config.cartCountPattern);
          const cartTextMatch =
            config.expectedCartText &&
            afterText.toLowerCase().includes(String(config.expectedCartText).toLowerCase());
          const cartChanged = cartAfter != null && cartBefore != null && cartAfter > cartBefore;
          const cartDetected = cartChanged || cartTextMatch || /cart|added|basket/i.test(afterText);

          if (cartDetected) {
            addStep(state, 'Verify cart updated', 'passed', 'Cart signal detected (payment not attempted)');
          } else {
            addStep(state, 'Verify cart updated', 'failed', 'No cart update detected');
            addIssue(state, {
              type: 'validation',
              severity: 'critical',
              message: 'Add to cart did not update cart state',
              recommendation:
                'Verify add-to-cart selector and expected cart text/count pattern. Payment is never attempted.',
            });
          }
        }
      }

      state.consoleErrors = consoleTracker.getDeduped();
      if (page) state.screenshotPath = await captureScreenshot(page, 'scenario-checkout');
    } catch (error) {
      addStep(state, 'Run checkout smoke scenario', 'failed', error.message);
    } finally {
      if (page) await page.close().catch(() => {});
    }

    const status = resolveStatus(state);
    state.summary = buildSummary(status, 'checkout-smoke', state);
    return finalize(state, status);
  });
}

function extractCartCount(text, pattern) {
  const regex = pattern ? new RegExp(pattern, 'i') : /cart[^\d]*(\d+)|(\d+)[^\d]*item/i;
  const match = text.match(regex);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function finalize(state, status) {
  const score = computeScenarioScore(state, status);
  return {
    status,
    score,
    result: {
      steps: state.steps,
      issues: state.issues,
      consoleErrors: state.consoleErrors,
      summary: state.summary,
    },
    screenshotPath: state.screenshotPath,
  };
}

module.exports = {
  runContactForm,
  runCtaLink,
  runMobileNav,
  runBrokenLinks,
  runCheckoutSmoke,
};
