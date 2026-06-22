const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const scanRoutes = require('./routes/scans');
const reportRoutes = require('./routes/reports');
const scenarioRoutes = require('./routes/scenarios');
const scenarioRunRoutes = require('./routes/scenarioRuns');
const pageInspectorRoutes = require('./routes/pageInspector');
const flowSuggestionsRoutes = require('./routes/flowSuggestions');
const flowRoutes = require('./routes/flows');
const projectRoutes = require('./routes/projects');
const monitoringFlowRoutes = require('./routes/monitoringFlows');
const flowRunRoutes = require('./routes/flowRuns');
const testCollectionRoutes = require('./routes/testCollections');
const testDiscoveryRoutes = require('./routes/testDiscovery');
const analyzerRoutes = require('./routes/analyzer');
const { startScheduler, stopScheduler } = require('./services/monitoring/scheduler');

const app = express();

if (!fs.existsSync(config.screenshotsDir)) {
  fs.mkdirSync(config.screenshotsDir, { recursive: true });
}
if (!fs.existsSync(config.videosDir)) {
  fs.mkdirSync(config.videosDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  next(err);
});

app.use('/uploads', express.static(config.uploadsDir));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'frontend-qa-agent',
    version: '0.9.0',
    features: [
      'scans',
      'reports',
      'scenarios',
      'page-inspector',
      'flow-wizard',
      'flow-suggestions',
      'flow-autopilot',
      'success-condition-assistant',
      'guided-element-picker',
      'test-reliability-score',
      'flow-recorder',
      'selector-fallback',
      'flow-monitoring',
      'test-collections',
      'multi-page-discovery',
      'safe-action-probing',
      'website-test-analyzer',
    ],
  });
});

app.use('/api/scans', scanRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/scenario-runs', scenarioRunRoutes);
app.use('/api/page-inspector', pageInspectorRoutes);
app.use('/api/flow-suggestions', flowSuggestionsRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/monitoring/flows', monitoringFlowRoutes);
app.use('/api/monitoring/flow-runs', flowRunRoutes);
app.use('/api/test-collections', testCollectionRoutes);
app.use('/api/test-discovery', testDiscoveryRoutes);
app.use('/api/analyzer', analyzerRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const server = app.listen(config.port, () => {
  console.log(`Frontend QA Agent API running at http://localhost:${config.port}`);
  startScheduler();
});

server.on('error', (error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});

function shutdown() {
  stopScheduler();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
