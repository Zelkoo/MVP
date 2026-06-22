/**
 * End-to-end backend audit script.
 * Run: node scripts/audit-api.js [baseUrl]
 */
const baseUrl = process.argv[2] || 'http://localhost:3000';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log(`Auditing API at ${baseUrl}\n`);

  const health = await request('/api/health');
  assert(health.status === 200, `Health check failed: ${health.status}`);
  assert(health.body.status === 'ok', 'Health body invalid');
  console.log('✓ Health check');

  const scanRes = await request('/api/scans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  });
  assert(scanRes.status === 201, `Scan failed: ${scanRes.status} ${JSON.stringify(scanRes.body)}`);
  const scan = scanRes.body;
  assert(scan.id, 'Scan missing id');
  assert(typeof scan.score === 'number', 'Scan missing score');
  assert(scan.desktopScreenshotPath, 'Missing desktop screenshot path');
  assert(scan.mobileScreenshotPath, 'Missing mobile screenshot path');
  assert(Array.isArray(scan.issues), 'Issues must be array');
  assert(scan.report?.pages?.length >= 1, 'Scan missing structured report.pages');
  assert(scan.publicToken, 'Scan missing publicToken');
  console.log(`✓ Scan created id=${scan.id} score=${scan.score} token=${scan.publicToken.slice(0, 8)}...`);

  const desktop = await request(scan.desktopScreenshotPath);
  assert(desktop.status === 200, `Desktop screenshot failed: ${desktop.status}`);
  assert(desktop.headers.get('content-type')?.includes('image'), 'Desktop screenshot not an image');
  console.log('✓ Desktop screenshot served');

  const mobile = await request(scan.mobileScreenshotPath);
  assert(mobile.status === 200, `Mobile screenshot failed: ${mobile.status}`);
  console.log('✓ Mobile screenshot served');

  const list = await request('/api/scans');
  assert(list.status === 200, 'List scans failed');
  assert(Array.isArray(list.body), 'List must be array');
  assert(list.body.some((s) => s.id === scan.id), 'New scan not in history');
  assert(typeof list.body[0].score === 'number' || list.body[0].score == null, 'List item score field issue');
  console.log(`✓ Scan history (${list.body.length} scans)`);

  const detail = await request(`/api/scans/${scan.id}`);
  assert(detail.status === 200, 'Scan detail failed');
  assert(detail.body.id === scan.id, 'Detail id mismatch');
  assert(detail.body.issues.length === scan.issues.length, 'Detail issues count mismatch');
  assert(detail.body.pages?.length >= 1, 'Detail missing pages array');
  assert(detail.body.publicToken === scan.publicToken, 'Detail publicToken mismatch');
  console.log('✓ Scan detail with pages, issues and stats');

  const publicReport = await request(`/api/reports/${scan.publicToken}`);
  assert(publicReport.status === 200, 'Public report failed');
  assert(publicReport.body.token === scan.publicToken, 'Public report token mismatch');
  assert(publicReport.body.id == null, 'Public report must not expose internal id');
  assert(typeof publicReport.body.score === 'number', 'Public report missing score');
  assert(Array.isArray(publicReport.body.issues), 'Public report issues must be array');
  assert(
    publicReport.body.issues.every((issue) => issue.id == null && issue.scanId == null),
    'Public report issues must not expose internal ids'
  );
  console.log('✓ Public report by token (no internal IDs)');

  const bad = await request('/api/scans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1' }),
  });
  assert(bad.status === 400, `SSRF should be blocked, got ${bad.status}`);
  console.log('✓ SSRF URL blocked');

  const notFound = await request('/api/scans/999999');
  assert(notFound.status === 404, 'Expected 404 for missing scan');
  console.log('✓ 404 for missing scan');

  const badToken = await request('/api/reports/not-a-valid-token');
  assert(badToken.status === 400, 'Invalid public token should return 400');
  console.log('✓ Invalid public report token rejected');

  const scenarioRes = await request('/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Audit broken links',
      type: 'broken-links',
      startUrl: 'https://example.com',
      config: { maxLinks: 5 },
    }),
  });
  assert(scenarioRes.status === 201, `Create scenario failed: ${scenarioRes.status}`);
  assert(scenarioRes.body.id, 'Scenario missing id');
  console.log(`✓ Scenario created id=${scenarioRes.body.id}`);

  const runRes = await request(`/api/scenarios/${scenarioRes.body.id}/run`, { method: 'POST' });
  assert(runRes.status === 201, `Run scenario failed: ${runRes.status}`);
  assert(runRes.body.result?.steps?.length >= 1, 'Scenario run missing steps');
  console.log(`✓ Scenario run id=${runRes.body.id} status=${runRes.body.status}`);

  const flowRes = await request('/api/scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Audit custom flow',
      type: 'flow',
      startUrl: 'https://example.com',
      config: {
        steps: [
          { action: 'goto', label: 'Open site', url: 'https://example.com' },
          {
            action: 'expectVisible',
            label: 'Heading visible',
            selector: '#missing-audit-selector',
            selectorAlternatives: ['h1'],
            elementLabel: 'Heading',
            targetText: 'Example Domain',
          },
          { action: 'expectUrlContains', label: 'URL check', value: 'example.com' },
          { action: 'screenshot', label: 'Capture page' },
        ],
      },
    }),
  });
  assert(flowRes.status === 201, `Create flow scenario failed: ${flowRes.status}`);
  assert(flowRes.body.type === 'flow', 'Flow scenario type mismatch');
  assert(Array.isArray(flowRes.body.config?.steps), 'Flow scenario missing steps');
  console.log(`✓ Flow scenario created id=${flowRes.body.id} steps=${flowRes.body.config.steps.length}`);

  const flowRunRes = await request(`/api/scenarios/${flowRes.body.id}/run`, { method: 'POST' });
  assert(flowRunRes.status === 201, `Run flow scenario failed: ${flowRunRes.status}`);
  assert(flowRunRes.body.result?.steps?.length === 4, 'Flow run should have 4 step results');
  assert(
    flowRunRes.body.result.steps.every((step) => step.status && typeof step.durationMs === 'number'),
    'Flow steps must include status and durationMs'
  );
  const fallbackStep = flowRunRes.body.result.steps.find((step) => step.action === 'expectVisible');
  assert(fallbackStep?.selectorStrategy, 'Fallback step should record selectorStrategy');
  assert(Array.isArray(fallbackStep?.attempts), 'Fallback step should record selector attempts');
  console.log(`✓ Flow scenario run id=${flowRunRes.body.id} status=${flowRunRes.body.status}`);

  const runDetail = await request(`/api/scenario-runs/${runRes.body.id}`);
  assert(runDetail.status === 200, 'Scenario run detail failed');
  assert(runDetail.body.scenario?.name, 'Scenario run detail missing scenario');
  console.log('✓ Scenario run detail');

  const inspectRes = await request('/api/page-inspector/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', viewport: 'desktop' }),
  });
  assert(inspectRes.status === 200, `Page inspect failed: ${inspectRes.status}`);
  assert(inspectRes.body.screenshotPath, 'Inspect missing screenshotPath');
  assert(Array.isArray(inspectRes.body.elements), 'Inspect elements must be array');
  assert(inspectRes.body.status, 'Inspect missing status');
  assert(Array.isArray(inspectRes.body.warnings), 'Inspect warnings must be array');
  assert(inspectRes.body.timing?.loadDurationMs != null, 'Inspect missing timing metadata');
  if (inspectRes.body.elements.length > 0) {
    const sample = inspectRes.body.elements[0];
    assert(sample.category, 'Element missing category');
    assert(sample.importance, 'Element missing importance');
    assert(sample.humanLabel, 'Element missing humanLabel');
    assert(sample.businessMeaning, 'Element missing businessMeaning');
    assert(Array.isArray(sample.suggestedActions), 'Element suggestedActions must be array');
    assert(sample.explanation, 'Element missing explanation');
  }
  console.log(`✓ Page inspector status=${inspectRes.body.status} elements=${inspectRes.body.elements.length}`);

  const suggestionsRes = await request('/api/flow-suggestions/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', viewport: 'desktop' }),
  });
  assert(suggestionsRes.status === 200, `Flow suggestions failed: ${suggestionsRes.status}`);
  assert(Array.isArray(suggestionsRes.body.suggestions), 'Suggestions must be array');
  assert(suggestionsRes.body.screenshotPath, 'Suggestions missing screenshotPath');
  assert(suggestionsRes.body.status, 'Suggestions missing status');
  assert(Array.isArray(suggestionsRes.body.warnings), 'Suggestions warnings must be array');
  if (suggestionsRes.body.suggestions.length > 0) {
    const sample = suggestionsRes.body.suggestions[0];
    assert(sample.businessValue, 'Suggestion missing businessValue');
    assert(Array.isArray(sample.suggestedReasons), 'Suggestion suggestedReasons must be array');
    assert(sample.estimatedReliability, 'Suggestion missing estimatedReliability');
    assert(Array.isArray(sample.successConditions), 'Suggestion successConditions must be array');
    assert(['high', 'medium', 'low'].includes(sample.confidenceLevel), 'Suggestion missing confidenceLevel');
  }
  console.log(`✓ Flow suggestions status=${suggestionsRes.body.status} count=${suggestionsRes.body.suggestions.length}`);

  const dryRunRes = await request('/api/flows/dry-run-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrl: 'https://example.com',
      steps: [
        { action: 'goto', label: 'Open page', url: 'https://example.com' },
        { action: 'click', label: 'Click more information', text: 'More information' },
      ],
    }),
  });
  assert(dryRunRes.status === 200, `Dry run analyze failed: ${dryRunRes.status}`);
  assert(Array.isArray(dryRunRes.body.suggestions), 'Dry run suggestions must be array');
  assert(Array.isArray(dryRunRes.body.executedSteps), 'Dry run executedSteps must be array');
  assert(dryRunRes.body.status, 'Dry run missing status');
  if (dryRunRes.body.suggestions.length > 0) {
    const sample = dryRunRes.body.suggestions[0];
    assert(sample.type, 'Dry run suggestion missing type');
    assert(sample.confidence, 'Dry run suggestion missing confidence');
    assert(sample.reason, 'Dry run suggestion missing reason');
    assert(sample.plainLanguage, 'Dry run suggestion missing plainLanguage');
  }
  console.log(`✓ Dry run analyze status=${dryRunRes.body.status} suggestions=${dryRunRes.body.suggestions.length}`);

  const reliabilityRes = await request('/api/scenarios/reliability-score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'flow',
      startUrl: 'https://example.com',
      steps: [
        { action: 'goto', label: 'Open page', url: 'https://example.com' },
        { action: 'fill', label: 'Fill email', selector: '[data-testid="email"]', value: 'test@example.com' },
        { action: 'click', label: 'Submit', selector: 'text=Submit' },
        { action: 'waitForText', label: 'Check success', text: 'thank' },
        { action: 'screenshot', label: 'Capture screenshot' },
      ],
    }),
  });
  assert(reliabilityRes.status === 200, `Reliability score failed: ${reliabilityRes.status}`);
  assert(typeof reliabilityRes.body.score === 'number', 'Reliability missing score');
  assert(reliabilityRes.body.badge, 'Reliability missing badge');
  assert(reliabilityRes.body.summary, 'Reliability missing summary');
  assert(Array.isArray(reliabilityRes.body.improvements), 'Reliability improvements must be array');
  console.log(`✓ Reliability score=${reliabilityRes.body.score} badge=${reliabilityRes.body.badge}`);

  const projectRes = await request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Audit Monitoring', domain: 'example.com' }),
  });
  assert(projectRes.status === 201, `Create project failed: ${projectRes.status}`);
  assert(projectRes.body.id, 'Project missing id');
  assert(projectRes.body.stats, 'Project missing stats');
  console.log(`✓ Monitoring project created id=${projectRes.body.id}`);

  const monitoredFlowRes = await request('/api/monitoring/flows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: projectRes.body.id, scenarioId: flowRes.body.id }),
  });
  assert(monitoredFlowRes.status === 201, `Create monitored flow failed: ${monitoredFlowRes.status}`);
  assert(monitoredFlowRes.body.projectId === projectRes.body.id, 'Monitored flow project mismatch');
  assert(monitoredFlowRes.body.stats, 'Monitored flow missing stats');
  assert(monitoredFlowRes.body.reliability?.score != null, 'Monitored flow missing reliability');
  console.log(`✓ Monitored flow created id=${monitoredFlowRes.body.id}`);

  const projectDetail = await request(`/api/projects/${projectRes.body.id}`);
  assert(projectDetail.status === 200, 'Project detail failed');
  assert(Array.isArray(projectDetail.body.flows), 'Project detail flows must be array');
  assert(projectDetail.body.flows.length >= 1, 'Project detail missing flows');
  console.log('✓ Project dashboard detail');

  const schedulePatch = await request(`/api/monitoring/flows/${monitoredFlowRes.body.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schedule: 'daily', isActive: true }),
  });
  assert(schedulePatch.status === 200, `Update flow schedule failed: ${schedulePatch.status}`);
  assert(schedulePatch.body.schedule === 'daily', 'Flow schedule not updated');
  assert(schedulePatch.body.nextRunAt, 'Scheduled flow missing nextRunAt');
  console.log('✓ Flow schedule updated');

  const monitoredRun = await request(`/api/monitoring/flows/${monitoredFlowRes.body.id}/run`, {
    method: 'POST',
  });
  assert(monitoredRun.status === 201, `Monitored flow run failed: ${monitoredRun.status}`);
  assert(monitoredRun.body.status, 'Monitored run missing status');
  assert(typeof monitoredRun.body.durationMs === 'number', 'Monitored run missing durationMs');
  console.log(`✓ Monitored flow run id=${monitoredRun.body.id} status=${monitoredRun.body.status}`);

  const runHistory = await request(`/api/monitoring/flows/${monitoredFlowRes.body.id}/runs`);
  assert(runHistory.status === 200, 'Flow run history failed');
  assert(Array.isArray(runHistory.body), 'Flow runs must be array');
  assert(runHistory.body.length >= 1, 'Flow run history empty');
  console.log(`✓ Flow run history count=${runHistory.body.length}`);

  const flowRunDetail = await request(`/api/monitoring/flow-runs/${monitoredRun.body.id}`);
  assert(flowRunDetail.status === 200, 'Flow run detail failed');
  assert(flowRunDetail.body.flow?.name, 'Flow run detail missing flow');
  console.log('✓ Flow run detail');

  const collectionFromUrl = await request('/api/test-collections/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://the-internet.herokuapp.com/' }),
  });
  assert(collectionFromUrl.status === 200, `Collection from-url failed: ${collectionFromUrl.status}`);
  assert(collectionFromUrl.body.origin === 'https://the-internet.herokuapp.com', 'Collection origin mismatch');
  assert(collectionFromUrl.body.domain === 'the-internet.herokuapp.com', 'Collection domain mismatch');
  const collectionId = collectionFromUrl.body.id;
  console.log(`✓ Test collection from URL id=${collectionId} name=${collectionFromUrl.body.name}`);

  const collectionList = await request('/api/test-collections');
  assert(collectionList.status === 200, 'List collections failed');
  assert(Array.isArray(collectionList.body), 'Collections list must be array');
  assert(collectionList.body.some((c) => c.id === collectionId), 'New collection not in list');
  console.log(`✓ Test collections list count=${collectionList.body.length}`);

  const mockSuggestion = {
    id: 'audit-add-remove',
    title: 'Add and remove element',
    patternType: 'add-remove-element',
    sourceUrl: 'https://the-internet.herokuapp.com/add_remove_elements/',
    startUrl: 'https://the-internet.herokuapp.com/add_remove_elements/',
    scenarioType: 'flow',
    safetyLevel: 'safe',
    primaryLabel: 'Add Element',
    selectorOrLabel: 'Delete',
    steps: [
      { action: 'goto', label: 'Open page', url: 'https://the-internet.herokuapp.com/add_remove_elements/' },
      { action: 'click', label: 'Click Add Element', selector: 'button', elementLabel: 'Add Element' },
    ],
    generatedBy: 'crawler',
  };

  const addSuggestions = await request(`/api/test-collections/${collectionId}/add-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestions: [mockSuggestion] }),
  });
  assert(addSuggestions.status === 200, `Add suggestions failed: ${addSuggestions.status}`);
  assert(addSuggestions.body.added === 1, 'Expected one added suggestion');
  const savedScenarioId = addSuggestions.body.created?.[0]?.scenario?.id;
  assert(savedScenarioId, 'Added scenario missing id');
  console.log(`✓ Added generated test to collection scenarioId=${savedScenarioId}`);

  const duplicateAdd = await request(`/api/test-collections/${collectionId}/add-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suggestions: [mockSuggestion] }),
  });
  assert(duplicateAdd.status === 200, `Duplicate add failed: ${duplicateAdd.status}`);
  assert(duplicateAdd.body.skipped === 1, 'Duplicate suggestion should be skipped');
  console.log('✓ Duplicate generated test skipped by signature');

  const collectionDetail = await request(`/api/test-collections/${collectionId}`);
  assert(collectionDetail.status === 200, 'Collection detail failed');
  assert(Array.isArray(collectionDetail.body.groupedTests), 'Collection detail missing groupedTests');
  assert(collectionDetail.body.scenarios.length >= 1, 'Collection detail missing scenarios');
  console.log('✓ Collection detail with grouped tests');

  const discoveryJobStart = await request('/api/test-discovery/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      maxPages: 1,
      maxActions: 3,
      includeSubpages: false,
      mode: 'safe',
    }),
  });
  assert(discoveryJobStart.status === 202, `Discovery job start failed: ${discoveryJobStart.status}`);
  assert(discoveryJobStart.body.jobId, 'Discovery job missing jobId');
  assert(discoveryJobStart.body.status === 'queued', 'Discovery job should start queued');
  const discoveryJobId = discoveryJobStart.body.jobId;
  console.log(`✓ Discovery job created id=${discoveryJobId}`);

  const discoveryJobStatus = await request(`/api/test-discovery/jobs/${discoveryJobId}`);
  assert(discoveryJobStatus.status === 200, `Discovery job status failed: ${discoveryJobStatus.status}`);
  assert(discoveryJobStatus.body.stats, 'Discovery job missing stats');
  assert(typeof discoveryJobStatus.body.progressPercent === 'number', 'Discovery job missing progressPercent');
  assert(['queued', 'running', 'completed', 'failed', 'partial', 'cancelled'].includes(discoveryJobStatus.body.status), 'Invalid discovery job status');
  console.log(`✓ Discovery job status=${discoveryJobStatus.body.status} progress=${discoveryJobStatus.body.progressPercent}%`);

  const discoveryJobResultPending = await request(`/api/test-discovery/jobs/${discoveryJobId}/result`);
  assert(
    discoveryJobResultPending.status === 202 || discoveryJobResultPending.status === 200,
    `Discovery job result failed: ${discoveryJobResultPending.status}`
  );
  console.log('✓ Discovery job result endpoint reachable');

  const deleteScenario = await request(`/api/scenarios/${savedScenarioId}`, { method: 'DELETE' });
  assert(deleteScenario.status === 200, `Delete scenario failed: ${deleteScenario.status}`);
  console.log('✓ Delete individual generated test');

  const deleteCollection = await request(`/api/test-collections/${collectionId}?deleteTests=true`, {
    method: 'DELETE',
  });
  assert(deleteCollection.status === 200, `Delete collection failed: ${deleteCollection.status}`);
  console.log('✓ Delete collection');

  console.log('\nAll backend audit checks passed.');
}

main().catch((error) => {
  console.error('\nAudit failed:', error.message);
  process.exit(1);
});
