/** Parses SQLite UTC timestamps like "2026-06-20 10:47:59". */
export function formatScanDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';

  const normalized = dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function issueTrackId(index: number, issue: { id?: number; message: string; type: string }): string | number {
  return issue.id ?? `${issue.type}-${issue.message}-${index}`;
}
