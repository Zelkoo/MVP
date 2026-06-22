class ConsoleTracker {
  constructor() {
    this.errors = [];
  }

  attach(page) {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        this.record(message.text());
      }
    });

    page.on('pageerror', (error) => {
      this.record(error.message || String(error));
    });
  }

  record(text) {
    const normalized = (text || '').trim().replace(/\s+/g, ' ');
    if (normalized) {
      this.errors.push(normalized);
    }
  }

  getDeduped() {
    const seen = new Set();
    const deduped = [];

    for (const error of this.errors) {
      const key = error.replace(/:\d+:\d+/g, ':line:col').slice(0, 240);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(error);
    }

    return deduped;
  }
}

module.exports = { ConsoleTracker };
