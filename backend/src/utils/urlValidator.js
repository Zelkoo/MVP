const dns = require('dns').promises;
const net = require('net');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateOrBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;

    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe80')) return true;
  }

  return false;
}

function parseUrl(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'URL is required.' };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: 'URL is required.' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http and https URLs are allowed.' };
  }

  if (!parsed.hostname) {
    return { valid: false, error: 'URL must include a hostname.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: 'URLs with embedded credentials are not allowed.' };
  }

  const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    return { valid: false, error: 'This hostname is not allowed.' };
  }

  if (net.isIP(hostname) && isPrivateOrBlockedIp(hostname)) {
    return { valid: false, error: 'Private or local network addresses are not allowed.' };
  }

  return { valid: true, url: parsed.href, hostname };
}

/**
 * Validates URL format, protocol, and resolves DNS to block SSRF targets.
 */
async function validateUrl(input) {
  const parsed = parseUrl(input);
  if (!parsed.valid) return parsed;

  if (net.isIP(parsed.hostname)) {
    return parsed;
  }

  try {
    const lookedUp = await dns.lookup(parsed.hostname, { all: true });

    for (const entry of lookedUp) {
      if (isPrivateOrBlockedIp(entry.address)) {
        return { valid: false, error: 'URL resolves to a blocked address.' };
      }
    }

    return { valid: true, url: parsed.url };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'EBADNAME') {
      return { valid: false, error: 'Could not resolve hostname.' };
    }

    // DNS may be unavailable in some environments; Playwright can still attempt the scan.
    console.warn(`DNS pre-check skipped for ${parsed.hostname}: ${error.message}`);
    return { valid: true, url: parsed.url };
  }
}

module.exports = { validateUrl, parseUrl, isPrivateOrBlockedIp };
