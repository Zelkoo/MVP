const monitoringRepository = require('./monitoringRepository');
const { sendFailureAlertEmail, sendRecoveryAlertEmail } = require('./emailService');

function isPassed(status) {
  return status === 'passed';
}

function isFailed(status) {
  return Boolean(status) && status !== 'passed';
}

async function evaluateFlowAlerts({ flow, project, previousStatus, currentRun }) {
  if (!flow?.alertEmail) {
    return { alertsSent: [] };
  }

  const currentStatus = currentRun.status;
  const threshold = Math.max(parseInt(flow.failureThreshold, 10) || 1, 1);
  let consecutiveFailures = flow.consecutiveFailureCount || 0;
  const alertsSent = [];

  if (isPassed(currentStatus)) {
    consecutiveFailures = 0;
    monitoringRepository.updateFlowAlertState(flow.id, { consecutiveFailureCount: 0 });

    if (
      flow.alertOnRecovery !== false &&
      isFailed(previousStatus) &&
      flow.lastAlertStatus !== 'recovery'
    ) {
      await sendRecoveryAlertEmail({ flow, project, run: currentRun });
      monitoringRepository.updateFlowAlertState(flow.id, {
        lastAlertSentAt: new Date().toISOString(),
        lastAlertStatus: 'recovery',
      });
      alertsSent.push('recovery');
    }
    return { alertsSent };
  }

  if (isFailed(currentStatus)) {
    consecutiveFailures += 1;
    monitoringRepository.updateFlowAlertState(flow.id, { consecutiveFailureCount: consecutiveFailures });

    if (
      flow.alertOnFailure !== false &&
      consecutiveFailures >= threshold &&
      flow.lastAlertStatus !== 'failure'
    ) {
      await sendFailureAlertEmail({ flow, project, run: currentRun });
      monitoringRepository.updateFlowAlertState(flow.id, {
        lastAlertSentAt: new Date().toISOString(),
        lastAlertStatus: 'failure',
      });
      alertsSent.push('failure');
    }
  }

  return { alertsSent };
}

module.exports = {
  evaluateFlowAlerts,
};
