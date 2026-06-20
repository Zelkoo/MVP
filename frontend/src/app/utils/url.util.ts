export function getDomain(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function sameDomain(
  urlA: string | null | undefined,
  urlB: string | null | undefined
): boolean {
  const domainA = getDomain(urlA || '');
  const domainB = getDomain(urlB || '');
  return !!domainA && domainA === domainB;
}
