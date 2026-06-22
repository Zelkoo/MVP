function nodeId(prefix, value) {
  return `${prefix}:${String(value).slice(0, 120)}`;
}

function buildActionGraph(context = {}) {
  const {
    siteMap = [],
    behaviors = [],
    suggestions = [],
    pageStates = new Map(),
  } = context;

  const nodes = [];
  const edges = [];

  for (const page of siteMap) {
    nodes.push({
      id: nodeId('page', page.url),
      type: 'page',
      url: page.url,
      path: page.path,
      intent: page.intent,
      importance: page.importance,
      title: page.title,
    });
  }

  for (const behavior of behaviors) {
    const behaviorId = nodeId(
      'behavior',
      `${behavior.type}-${behavior.sourceUrl}-${behavior.action?.humanLabel || behavior.action?.element?.signature}`
    );
    nodes.push({
      id: behaviorId,
      type: 'behavior',
      behaviorType: behavior.type,
      sourceUrl: behavior.sourceUrl,
      summary: behavior.summary,
      action: behavior.action,
      safetyLevel: behavior.safety?.safetyLevel || behavior.safetyLevel || 'safe',
    });

    edges.push({
      from: nodeId('page', behavior.sourceUrl),
      to: behaviorId,
      type: 'observed-on-page',
    });

    if (behavior.type === 'navigation' && behavior.destinationUrl) {
      edges.push({
        from: behaviorId,
        to: nodeId('page', behavior.destinationUrl),
        type: 'navigates-to',
      });
    }

    if (behavior.revealedElement) {
      nodes.push({
        id: nodeId('element', behavior.revealedElement.signature),
        type: 'element',
        element: behavior.revealedElement,
      });
      edges.push({
        from: behaviorId,
        to: nodeId('element', behavior.revealedElement.signature),
        type: 'reveals-element',
      });
    }
  }

  for (const suggestion of suggestions) {
    nodes.push({
      id: nodeId('suggestion', suggestion.id),
      type: 'suggestion',
      suggestionId: suggestion.id,
      suggestionType: suggestion.type,
      title: suggestion.title,
    });
    edges.push({
      from: nodeId('page', suggestion.sourceUrl),
      to: nodeId('suggestion', suggestion.id),
      type: 'suggests-test',
    });
  }

  return {
    nodes,
    edges,
    pageStates: Object.fromEntries(pageStates instanceof Map ? pageStates.entries() : []),
  };
}

function findPageByIntent(siteMap, intents = []) {
  return siteMap.filter((page) => intents.includes(page.intent));
}

function findBehaviors(behaviors, filterFn) {
  return behaviors.filter(filterFn);
}

module.exports = {
  buildActionGraph,
  findPageByIntent,
  findBehaviors,
  nodeId,
};
