const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const request = http.request(
      {
        hostname: process.env.BACKEND_HOST || 'localhost',
        port: parseInt(process.env.BACKEND_PORT || '3100', 10),
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      
      (res) => {
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(buffer || '{}') });
          } catch {
            resolve({ status: res.statusCode, body: buffer });
          }
        });
      }
    );
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

async function waitForJob(id) {
  let job;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    job = (await req('GET', `/api/analyzer/jobs/${id}`)).body;
    if (['completed', 'failed', 'partial', 'cancelled'].includes(job.status)) {
      return job;
    }
  }
  return job;
}

async function analyzeUrl(label, url, depth = 'quick') {
  const start = await req('POST', '/api/analyzer/jobs', { url, depth, mode: 'safe' });
  if (start.status !== 202) {
    console.log(`${label}: START FAILED`, start.status, start.body);
    return null;
  }

  const id = start.body.jobId || start.body.id;
  const job = await waitForJob(id);
  const result = (await req('GET', `/api/analyzer/jobs/${id}/result`)).body;
  const types = [...new Set((result.suggestions || []).map((s) => s.type))];
  const composed = (result.suggestions || []).filter((s) => s.isComposedFlow).length;
  console.log(
    `${label}: ${job.status} suggestions=${(result.suggestions || []).length} composed=${composed} siteMap=${(result.siteMap || []).length} types=${types.join(',') || 'none'}`
  );
  console.log(`  stats:`, JSON.stringify(job.stats || {}));
  if (result.noResults) {
    console.log(`  noResults:`, result.noResults.summary);
  }
  return { job, result, types };
}

(async () => {
  const cases = [
    ['hovers', 'https://the-internet.herokuapp.com/hovers', 'hover-reveal'],
    ['add_remove', 'https://the-internet.herokuapp.com/add_remove_elements/', 'dynamic-element-created-and-removable'],
    ['checkboxes', 'https://the-internet.herokuapp.com/checkboxes', 'checkbox-toggle'],
    ['dropdown', 'https://the-internet.herokuapp.com/dropdown', 'dropdown-selection'],
    ['dynamic_loading', 'https://the-internet.herokuapp.com/dynamic_loading/1', 'dynamic-loading'],
    ['login', 'https://the-internet.herokuapp.com/login', 'login-error'],
    ['generic', 'https://example.com', null],
  ];

  const summary = [];
  for (const [label, url, expectedType] of cases) {
    const outcome = await analyzeUrl(label, url);
    if (!outcome) continue;
    const siteMapOk = Array.isArray(outcome.result.siteMap);
    const hasIntent = (outcome.result.siteMap || []).some((page) => page.intent && page.intent !== 'unknown');
    summary.push({
      label,
      ok: expectedType ? outcome.types.includes(expectedType) : outcome.result.suggestions !== undefined,
      siteMapOk,
      hasIntent,
      types: outcome.types,
      expectedType,
    });
  }

  console.log('\nSummary:');
  for (const row of summary) {
    console.log(
      `- ${row.label}: ${row.ok ? 'PASS' : 'CHECK'} siteMap=${row.siteMapOk ? 'yes' : 'no'} intent=${row.hasIntent ? 'yes' : 'no'} (${row.types.join(', ') || 'no types'})`
    );
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
