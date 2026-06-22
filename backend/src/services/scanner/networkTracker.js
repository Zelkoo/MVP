class NetworkTracker {
  constructor() {
    this.requests = [];
    this.failed = [];
    this.errorResponses = [];
    this.successResponses = [];
  }

  attach(page) {
    page.on('request', (request) => {
      this.requests.push({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        status: null,
        failure: null,
      });
    });

    page.on('requestfailed', (request) => {
      const entry = {
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        status: null,
        failure: request.failure()?.errorText || 'Request failed',
      };
      this.failed.push(entry);
    });

    page.on('response', (response) => {
      const status = response.status();
      const request = response.request();
      const entry = {
        method: request.method(),
        url: response.url(),
        resourceType: request.resourceType(),
        status,
        failure: null,
      };

      if (status >= 200 && status < 300) {
        this.successResponses.push(entry);
        return;
      }

      if (status < 400) return;

      this.errorResponses.push(entry);
    });
  }

  getSuccessfulResponses() {
    return this.successResponses;
  }

  findSuccessfulResponse({ urlPattern, sinceIndex = 0 } = {}) {
    const pattern = urlPattern ? String(urlPattern).toLowerCase() : null;
    return this.successResponses.slice(sinceIndex).find((entry) => {
      if (entry.status < 200 || entry.status >= 300) return false;
      if (pattern && !entry.url.toLowerCase().includes(pattern)) return false;
      return (
        entry.resourceType === 'xhr' ||
        entry.resourceType === 'fetch' ||
        entry.method === 'POST' ||
        entry.method === 'PUT' ||
        entry.method === 'PATCH'
      );
    });
  }

  summary() {
    return {
      totalRequests: this.requests.length,
      failedRequestsCount: this.failed.length,
      errorResponseCount: this.errorResponses.length,
      requests: this.requests,
      failed: this.failed,
      errorResponses: this.errorResponses,
    };
  }
}

module.exports = { NetworkTracker };
