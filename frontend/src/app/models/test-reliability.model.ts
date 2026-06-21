export type ReliabilityBadge = 'High' | 'Medium' | 'Low';

export interface ReliabilityFactor {
  key: string;
  label: string;
  score: number;
}

export interface TestReliabilityResult {
  score: number;
  badge: ReliabilityBadge;
  label: string;
  summary: string;
  explanation: string;
  improvements: string[];
  factors: ReliabilityFactor[];
}

export interface TestReliabilityInput {
  type?: string;
  startUrl?: string;
  config?: Record<string, unknown>;
  steps?: Record<string, unknown>[] | null;
}
