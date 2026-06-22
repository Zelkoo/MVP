const monitoringRepository = require('./monitoringRepository');

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function isYesterday(date, reference = new Date()) {
  const yesterday = startOfDay(reference);
  yesterday.setDate(yesterday.getDate() - 1);
  return startOfDay(date).getTime() === yesterday.getTime();
}

function flowDisplayName(name) {
  if (!name) return 'Flow';
  const cleaned = name
    .replace(/^Test:\s*/i, '')
    .replace(/^Verify\s+/i, '')
    .replace(/\s+on\s+\/[^\s]+$/i, '')
    .trim();
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 45).trim()}…`;
}

function getFlowClientStatus(flowRuns = []) {
  if (flowRuns.length === 0) {
    return { label: 'Not run yet', status: 'unknown' };
  }

  const latest = flowRuns[0];
  if (latest.status === 'passed') {
    const lastFailure = flowRuns.find((run) => run.status !== 'passed');
    if (lastFailure) {
      const failureAt = new Date(lastFailure.startedAt);
      const recoveredAt = new Date(latest.startedAt);
      if (isYesterday(failureAt, recoveredAt) && isSameDay(recoveredAt, new Date())) {
        return { label: 'failed yesterday, recovered today', status: 'recovered' };
      }
      if (isSameDay(failureAt, recoveredAt) && isSameDay(recoveredAt, new Date())) {
        return { label: 'recovered today', status: 'recovered' };
      }
    }
    return { label: 'passing', status: 'passed' };
  }

  const failedAt = new Date(latest.startedAt);
  if (isYesterday(failedAt)) {
    return { label: 'failed yesterday', status: 'failed' };
  }
  if (isSameDay(failedAt, new Date())) {
    return { label: 'failing today', status: 'failed' };
  }
  return { label: 'failing', status: 'failed' };
}

function getClientReport(projectId, limit = 30) {
  const project = monitoringRepository.getProjectById(projectId);
  if (!project) return null;

  const runLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const recentRuns = monitoringRepository.getProjectRecentRuns(projectId, runLimit);
  const passedCount = recentRuns.filter((run) => run.status === 'passed').length;
  const passRate = recentRuns.length ? Math.round((passedCount / recentRuns.length) * 100) : null;

  const flows = monitoringRepository.getFlowsByProjectId(projectId).map((flow) => {
    const flowRuns = monitoringRepository.getFlowRuns(flow.id, 10);
    const clientStatus = getFlowClientStatus(flowRuns);
    return {
      id: flow.id,
      name: flowDisplayName(flow.name),
      rawName: flow.name,
      statusLabel: clientStatus.label,
      status: clientStatus.status,
      lastRunAt: flowRuns[0]?.startedAt || flow.lastRunAt || null,
    };
  });

  return {
    domain: project.domain,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    passRate,
    recentRunCount: recentRuns.length,
    flows,
    recentRuns: [...recentRuns].reverse().map((run) => ({
      status: run.status,
      startedAt: run.startedAt,
      flowName: flowDisplayName(run.flowName),
    })),
  };
}

module.exports = {
  getClientReport,
  flowDisplayName,
  getFlowClientStatus,
};
