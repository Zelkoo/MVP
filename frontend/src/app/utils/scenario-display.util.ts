import { Scenario } from '../models/scenario.model';
import { CollectionScenario, SafetyLevel } from '../models/collection.model';

export type ScenarioDisplaySource = Scenario | CollectionScenario;

export function truncateText(text: string | null | undefined, maxLength = 80): string {
  if (!text) return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trim()}…`;
}

function patternType(scenario: ScenarioDisplaySource): string {
  const meta = scenario.metadata as { patternType?: string; category?: string; detectedBehavior?: { type?: string } } | undefined;
  return meta?.patternType || meta?.detectedBehavior?.type || meta?.category || scenario.type || '';
}

function sourcePath(scenario: ScenarioDisplaySource): string {
  const url = (scenario as CollectionScenario).sourceUrl || scenario.startUrl;
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url || '/';
  }
}

function domainFromScenario(scenario: ScenarioDisplaySource): string {
  const url = (scenario as CollectionScenario).sourceUrl || scenario.startUrl;
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function formatScenarioDisplayTitle(scenario: ScenarioDisplaySource): string {
  const raw = scenario.name || '';
  const type = patternType(scenario);
  const path = sourcePath(scenario);

  if (type === 'broken-links' || scenario.type === 'broken-links') {
    return 'Broken links check';
  }

  if (type === 'navigation' || /^navigate to /i.test(raw)) {
    const label = raw.replace(/^navigate to /i, '').trim();
    const clean = truncateText(label, 50);
    if (clean && clean.length <= 50 && !/^(https?:\/\/|www\.)/i.test(clean)) {
      return truncateText(`Navigation: ${clean}`, 80);
    }
    return truncateText(`Navigation: ${path}`, 80);
  }

  if (type === 'hover-reveal') {
    const label = truncateText(raw.replace(/^hover reveal:?/i, '').trim() || 'content', 40);
    return truncateText(`Hover reveal: ${label}`, 80);
  }

  if (type === 'dynamic-element-created-and-removable') {
    return 'Dynamic UI: add/remove element';
  }

  if (type === 'dynamic-element-created') {
    return 'Dynamic UI: create element';
  }

  if (type === 'checkbox-toggle') {
    return 'Checkbox toggle';
  }

  if (type === 'dropdown-selection') {
    return 'Dropdown selection';
  }

  if (type === 'form-validation') {
    return 'Form validation';
  }

  if (type === 'login-error') {
    return 'Invalid login error';
  }

  if (type === 'dynamic-loading' || type === 'dynamic-loading-flow') {
    return truncateText(raw.startsWith('Dynamic') ? raw : `Dynamic loading: ${raw}`, 80);
  }

  return truncateText(raw, 80);
}

export function scenarioPickerMetadata(scenario: ScenarioDisplaySource): {
  domain: string;
  path: string;
  type: string;
  reliability: string;
  safety: SafetyLevel | undefined;
} {
  const meta = scenario.metadata as { confidence?: number; safetyLevel?: SafetyLevel } | undefined;
  const reliability =
    meta?.confidence != null ? `${Math.round(meta.confidence * 100)}` : '—';

  return {
    domain: domainFromScenario(scenario),
    path: sourcePath(scenario),
    type: patternType(scenario).replace(/-/g, ' ') || scenario.type,
    reliability,
    safety: meta?.safetyLevel,
  };
}

export function scenarioMatchesSearch(scenario: ScenarioDisplaySource, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const meta = scenarioPickerMetadata(scenario);
  const haystack = [
    scenario.name,
    formatScenarioDisplayTitle(scenario),
    scenario.startUrl,
    (scenario as CollectionScenario).sourceUrl,
    meta.domain,
    meta.path,
    meta.type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

export function scenarioMatchesTypeFilter(scenario: ScenarioDisplaySource, typeFilter: string): boolean {
  if (!typeFilter) return true;
  const type = patternType(scenario);
  return type === typeFilter || scenario.type === typeFilter;
}

export function scenarioMatchesDomain(scenario: ScenarioDisplaySource, domain: string | null | undefined): boolean {
  if (!domain) return true;
  return domainFromScenario(scenario).toLowerCase() === domain.toLowerCase();
}
