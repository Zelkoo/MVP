const { runScenario } = require('../scenarios');
const { computeTestReliability } = require('../scenarios/testReliabilityScore');

function buildFlowConfig(flow) {
  const steps = Array.isArray(flow.steps) ? flow.steps : [];
  const successConditions = Array.isArray(flow.successConditions) ? flow.successConditions : [];
  const hasScreenshot = steps.some((step) => step.action === 'screenshot');

  return {
    steps: hasScreenshot ? [...steps, ...successConditions] : [...steps, ...successConditions, { action: 'screenshot', label: 'Capture final screenshot' }],
  };
}

function extractFailureReason(outcome) {
  if (!outcome) return 'Run did not complete.';
  if (outcome.status === 'passed') return null;

  const failedStep = outcome.result?.steps?.find((step) => step.status === 'failed');
  if (failedStep?.message) return failedStep.message;

  const issue = outcome.result?.issues?.find((entry) => entry.severity === 'critical');
  if (issue?.message) return issue.message;

  return outcome.result?.summary || 'The flow did not pass.';
}

async function executeMonitoringFlow(flow) {
  const startedAt = Date.now();
  const scenario = {
    name: flow.name,
    type: 'flow',
    startUrl: flow.startUrl,
    config: buildFlowConfig(flow),
  };

  const outcome = await runScenario(scenario);
  const durationMs = Date.now() - startedAt;
  const failureReason = extractFailureReason(outcome);
  const reliability = computeTestReliability({
    type: 'flow',
    startUrl: flow.startUrl,
    steps: scenario.config.steps,
  });

  return {
    status: outcome.status,
    score: outcome.score,
    durationMs,
    failureReason,
    screenshotPath: outcome.screenshotPath || null,
    result: outcome.result || {},
    reliability,
  };
}

module.exports = {
  executeMonitoringFlow,
  buildFlowConfig,
  extractFailureReason,
};
