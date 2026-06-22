const collectionRepository = require('./collectionRepository');
const collectionRunRepository = require('./collectionRunRepository');
const collectionRunService = require('./collectionRunService');
const scenarioRepository = require('../scenarioRepository');
const monitoringRepository = require('../monitoring/monitoringRepository');
const { runScenario } = require('../scenarios');
const { normalizeCollectionUrl, sourcePath } = require('./normalizeCollectionUrl');
const { buildTestSignature } = require('./testSignature');
const { validateUrl } = require('../../utils/urlValidator');
const {
  getCollectionAnalyzerSettings,
  saveCollectionAnalyzerSettings,
  compareAnalyzerRuns,
} = require('./collectionAnalyzerSettings');
const { runFlowAndRecord } = require('../monitoring/scheduler');
const { isValidSchedule } = require('../monitoring/scheduleUtils');

async function getOrCreateFromUrl(url) {
  const validation = await validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const normalized = normalizeCollectionUrl(validation.url);
  let collection = collectionRepository.getCollectionByOrigin(normalized.origin);

  if (!collection) {
    collection = collectionRepository.createCollection({
      name: normalized.name,
      domain: normalized.domain,
      origin: normalized.origin,
      startUrl: normalized.startUrl,
      description: `Generated tests for ${normalized.domain}`,
    });
  }

  return {
    ...collection,
    ...collectionRepository.getCollectionStats(collection.id),
  };
}

function groupScenariosBySource(scenarios, origin) {
  const groups = new Map();

  for (const scenario of scenarios) {
    const path = sourcePath(scenario.sourceUrl || scenario.startUrl, origin);
    if (!groups.has(path)) {
      groups.set(path, []);
    }
    groups.get(path).push(scenario);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, tests]) => ({ path, tests }));
}

function getCollectionMonitoringInfo(collection, scenarios) {
  const projects = monitoringRepository.getAllProjects();
  const project = projects.find((entry) => entry.domain === collection.domain);
  if (!project) {
    return {
      monitoredTests: {},
      monitoredScenarioIds: [],
      monitoringProject: null,
    };
  }

  const monitoredTests = monitoringRepository.buildMonitoredTestsMap(project.id, scenarios);
  return {
    monitoredTests,
    monitoredScenarioIds: Object.keys(monitoredTests).map((id) => parseInt(id, 10)),
    monitoringProject: {
      id: project.id,
      name: project.name,
      domain: project.domain,
    },
  };
}

function getCollectionDetail(id) {
  const collection = collectionRepository.getCollectionById(id);
  if (!collection) return null;

  const scenarios = scenarioRepository.getScenariosByCollectionId(id);
  const stats = collectionRepository.getCollectionStats(id);
  const suiteStats = collectionRunRepository.getCollectionSuiteStats(id);
  const monitoringInfo = getCollectionMonitoringInfo(collection, scenarios);

  return {
    ...collection,
    ...stats,
    scenarios,
    groupedTests: groupScenariosBySource(scenarios, collection.origin),
    analyzerSettings: getCollectionAnalyzerSettings(id),
    analyzerHistory: collection.metadata?.analyzerHistory || [],
    lastAnalyzerRun: collection.metadata?.lastAnalyzerRun || null,
    monitoredScenarioIds: monitoringInfo.monitoredScenarioIds,
    monitoredTests: monitoringInfo.monitoredTests,
    monitoringProject: monitoringInfo.monitoringProject,
    testTags: collection.metadata?.testTags || {},
    suiteStats,
  };
}

function addScenarioToCollection(collectionId, data, options = {}) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) {
    throw new Error('Collection not found.');
  }

  const signature = data.testSignature || buildTestSignature({
    sourceUrl: data.sourceUrl || data.startUrl,
    type: data.type || 'flow',
    primaryLabel: data.primaryLabel || data.name,
    selectorOrLabel: data.selectorOrLabel || data.name,
    steps: data.config?.steps || [],
    patternType: data.metadata?.patternType || data.metadata?.detectedBehavior?.type || '',
  });

  const existing = scenarioRepository.findScenarioBySignature(collectionId, signature);
  if (existing && !options.replace) {
    return {
      status: 'already_exists',
      scenario: existing,
      testSignature: signature,
    };
  }

  if (existing && options.replace) {
    scenarioRepository.deleteScenario(existing.id, { hard: true });
  }

  const scenario = scenarioRepository.createScenario({
    name: data.name,
    type: data.type || 'flow',
    startUrl: data.startUrl,
    config: data.config || {},
    collectionId,
    sourceUrl: data.sourceUrl || data.startUrl,
    generatedBy: data.generatedBy || 'autopilot',
    testSignature: signature,
    metadata: data.metadata || {},
  });

  collectionRepository.updateCollection(collectionId, {
    lastAnalyzedAt: new Date().toISOString(),
  });

  return {
    status: 'created',
    scenario,
    testSignature: signature,
  };
}

function bulkAddSuggestions(collectionId, suggestions, options = {}) {
  const results = { created: [], skipped: [], errors: [] };

  for (const suggestion of suggestions) {
    try {
      const outcome = addScenarioToCollection(
        collectionId,
        {
          name: suggestion.title,
          type: suggestion.scenarioType || 'flow',
          startUrl: suggestion.startUrl || suggestion.sourceUrl,
          sourceUrl: suggestion.sourceUrl,
          primaryLabel: suggestion.primaryLabel || suggestion.title,
          selectorOrLabel: suggestion.selectorOrLabel || suggestion.title,
          generatedBy: suggestion.generatedBy || 'crawler',
          config:
            suggestion.scenarioType === 'broken-links'
              ? suggestion.config || { maxLinks: 25 }
              : { steps: suggestion.steps || [], viewport: suggestion.viewport },
          metadata: {
            patternType: suggestion.patternType,
            detectedBehavior: suggestion.detectedBehavior,
            safetyLevel: suggestion.safetyLevel,
            confidence: suggestion.confidence,
            confidenceLevel: suggestion.confidenceLevel,
            sourcePageTitle: suggestion.sourcePageTitle,
            discoveryReasons: suggestion.discoveryReasons || [],
            category: suggestion.category || suggestion.type,
          },
        },
        { replace: options.replace === true }
      );

      if (outcome.status === 'already_exists') {
        results.skipped.push({ suggestion, scenario: outcome.scenario });
      } else {
        results.created.push({ suggestion, scenario: outcome.scenario });
      }
    } catch (error) {
      results.errors.push({ suggestion, error: error.message });
    }
  }

  return results;
}

async function runAllTests(collectionId, options = {}) {
  const detail = getCollectionDetail(collectionId);
  if (!detail) {
    throw new Error('Collection not found.');
  }

  const recordVideo = options.recordVideo === true;
  const results = [];

  for (const scenario of detail.scenarios) {
    if (!scenario.id) continue;

    try {
      const payload = recordVideo
        ? { ...scenario, config: { ...(scenario.config || {}), recordVideo: true } }
        : scenario;
      const outcome = await runScenario(payload);
      const run = scenarioRepository.createScenarioRun(scenario.id, outcome);
      results.push({
        scenarioId: scenario.id,
        name: scenario.name,
        status: run.status,
        runId: run.id,
      });
    } catch (error) {
      const run = scenarioRepository.createScenarioRun(scenario.id, {
        status: 'error',
        score: 0,
        screenshotPath: null,
        result: {
          steps: [{ name: 'Run scenario', status: 'failed', message: error.message }],
          issues: [
            {
              type: 'validation',
              severity: 'critical',
              message: 'Scenario run error',
              details: error.message,
              recommendation: 'Review scenario configuration and try again.',
            },
          ],
          consoleErrors: [],
          summary: `Scenario run error: ${error.message}`,
        },
      });
      results.push({
        scenarioId: scenario.id,
        name: scenario.name,
        status: 'error',
        runId: run.id,
        error: error.message,
      });
    }
  }

  const passed = results.filter((entry) => entry.status === 'passed').length;
  const failed = results.filter((entry) => entry.status !== 'passed').length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}

function deleteAllTestsInCollection(collectionId) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) {
    throw new Error('Collection not found.');
  }

  const scenarios = scenarioRepository.getScenariosByCollectionId(collectionId);
  let deleted = 0;
  for (const scenario of scenarios) {
    if (scenarioRepository.deleteScenario(scenario.id)) {
      deleted += 1;
    }
  }

  return { deleted };
}

function runSelectedTests(collectionId, scenarioIds = [], options = {}) {
  return collectionRunService.startCollectionRun(collectionId, scenarioIds, {
    parallelism: options.parallelism,
  });
}

function deleteSelectedTests(collectionId, scenarioIds = []) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) throw new Error('Collection not found.');
  let deleted = 0;
  for (const id of scenarioIds) {
    const scenario = scenarioRepository.getScenarioById(parseInt(id, 10));
    if (scenario && scenario.collectionId === collectionId && scenarioRepository.deleteScenario(scenario.id)) {
      deleted += 1;
    }
  }
  return { deleted };
}

function getOrCreateMonitoringProject(collection) {
  const projects = monitoringRepository.getAllProjects();
  let project = projects.find((entry) => entry.domain === collection.domain);
  if (!project) {
    project = monitoringRepository.createProject({
      name: `${collection.domain} monitoring`,
      domain: collection.domain,
    });
  }
  return project;
}

async function monitorSelectedTests(collectionId, scenarioIds = [], options = {}) {
  const detail = getCollectionDetail(collectionId);
  if (!detail) throw new Error('Collection not found.');

  const schedule = options.schedule || 'daily';
  if (!isValidSchedule(schedule)) {
    throw new Error('Invalid schedule.');
  }

  const project = getOrCreateMonitoringProject(detail);
  const allowed = new Set(scenarioIds.map((id) => parseInt(id, 10)));
  const createdFlows = [];
  const alreadyMonitored = [];
  const runJobs = [];

  for (const scenario of detail.scenarios) {
    if (!allowed.has(scenario.id)) continue;

    const existing = monitoringRepository.findFlowByScenarioInProject(project.id, scenario);
    if (existing) {
      alreadyMonitored.push({ scenarioId: scenario.id, flowId: existing.id });
      continue;
    }

    const flow = monitoringRepository.createFlowFromScenario(project.id, scenario);
    monitoringRepository.updateFlow(flow.id, {
      schedule,
      isActive: true,
      alertEmail: options.alertEmail || null,
      alertOnFailure: options.alertOnFailure !== false,
      alertOnRecovery: options.alertOnRecovery !== false,
      failureThreshold: options.failureThreshold || 1,
    });
    createdFlows.push({ scenarioId: scenario.id, flowId: flow.id });
  }

  if (options.runNow === true) {
    for (const entry of createdFlows) {
      const flow = monitoringRepository.getFlowById(entry.flowId);
      if (!flow) continue;
      try {
        const run = await runFlowAndRecord(flow);
        runJobs.push({ flowId: flow.id, runId: run.id, status: run.status });
      } catch (error) {
        runJobs.push({ flowId: flow.id, status: 'error', error: error.message });
      }
    }
  }

  if (options.alertEmail) {
    collectionRepository.updateCollection(collectionId, {
      metadata: {
        ...detail.metadata,
        monitorAlertEmail: options.alertEmail,
      },
    });
  }

  const refreshedScenarios = scenarioRepository.getScenariosByCollectionId(collectionId);
  const monitoredTests = monitoringRepository.buildMonitoredTestsMap(project.id, refreshedScenarios);
  collectionRepository.updateCollection(collectionId, {
    metadata: {
      ...(collectionRepository.getCollectionById(collectionId)?.metadata || detail.metadata),
      monitoredScenarioIds: Object.keys(monitoredTests).map((id) => parseInt(id, 10)),
    },
  });

  return {
    projectId: project.id,
    projectName: project.name,
    projectDomain: project.domain,
    created: createdFlows.length,
    alreadyMonitored: alreadyMonitored.length,
    runJobs,
    schedule,
  };
}

function tagSelectedTests(collectionId, scenarioIds = [], tag = '') {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) throw new Error('Collection not found.');
  const normalizedTag = String(tag || '').trim();
  if (!normalizedTag) throw new Error('Tag is required.');

  const testTags = { ...(collection.metadata?.testTags || {}) };
  for (const id of scenarioIds) {
    const key = String(parseInt(id, 10));
    const existing = new Set(testTags[key] || []);
    existing.add(normalizedTag);
    testTags[key] = [...existing];
  }

  return collectionRepository.updateCollection(collectionId, {
    metadata: {
      ...collection.metadata,
      testTags,
    },
  });
}

function getAnalyzerComparison(collectionId) {
  const collection = collectionRepository.getCollectionById(collectionId);
  if (!collection) return null;
  const history = collection.metadata?.analyzerHistory || [];
  if (history.length < 2) return null;
  return compareAnalyzerRuns(history[0], history[1]);
}

module.exports = {
  getOrCreateFromUrl,
  getCollectionDetail,
  addScenarioToCollection,
  bulkAddSuggestions,
  groupScenariosBySource,
  runAllTests,
  deleteAllTestsInCollection,
  runSelectedTests,
  deleteSelectedTests,
  monitorSelectedTests,
  getAnalyzerComparison,
  saveCollectionAnalyzerSettings,
  getCollectionAnalyzerSettings,
  tagSelectedTests,
};
