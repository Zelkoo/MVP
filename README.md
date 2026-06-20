# Flow Test Agent

**v0.4** — Guided flow builder for no-code website testing, plus legacy scenario types and secondary full-site scans.

Define business-critical user journeys step by step (go to URL, click, fill, wait, assert, screenshot) without writing code. Playwright runs each flow and returns pass/fail results with per-step timing, failure screenshots, and recommended fixes. Full-site technical scanning remains available under **Site Scans**.

> Only test websites you own or have explicit permission to test. Checkout scenarios add to cart but **never complete payment**.

---

## Primary features (v0.4)

- **Guided flow builder** — add, remove, and reorder steps without code
- **Step actions** — go to URL, click (selector or text), fill input, wait for text, expect URL contains, expect element visible, take screenshot
- **Example templates** — contact form, book a call, add to cart, newsletter signup
- **Generic Playwright runner** — steps stored as JSON; each step returns status, duration, error message, and screenshot on failure
- **Pass/fail results** — score, steps performed, issues, console errors for the run only
- **Legacy scenario types** — contact form, CTA link, mobile navigation, broken links, checkout smoke (pre-built runners)
- **Permission warnings** — built into create/run flows

## Secondary features (site scans)

- **Multi-page crawl** — up to 5 internal pages on the same domain (90s global timeout)
- **Scored QA report** — deterministic 0–100 score with critical / warning / info counts
- **Issue categories** — console errors, failed requests, broken links, accessibility, performance, SEO basics
- **Scan comparison & public client reports**

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular 19 (standalone components) |
| Backend | Node.js, Express 4 |
| Scanner | Playwright (Chromium headless) |
| Database | SQLite via `better-sqlite3` |
| Deployment | Docker Compose + nginx |

---

## Architecture

```
┌─────────────────┐     REST /api      ┌──────────────────┐
│  Angular SPA    │ ◄───────────────► │  Express API     │
│  :4200 / :8080  │     /uploads      │  :3000           │
└─────────────────┘                   └────────┬─────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
            ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
            │ SQLite DB     │          │ Playwright    │          │ Screenshot    │
            │ scans, issues │          │ scanner       │          │ files         │
            │ scan_pages    │          │ crawl + checks│          │ /uploads      │
            └───────────────┘          └───────────────┘          └───────────────┘
```

### Angular frontend (`frontend/`)

- Pages: home (scan input), history, scan detail, scan compare, public report
- Dev proxy forwards `/api` and `/uploads` to the backend
- Docker serves the built SPA via nginx on port **8080**

### Express API (`backend/src/`)

- `routes/scans.js` — create/list/detail scans
- `routes/reports.js` — public read-only reports by token
- `services/scanRepository.js` — SQLite persistence
- `utils/urlValidator.js` — SSRF-safe URL validation
- `utils/scanMetrics.js` — scoring, issue enrichment, recommended fixes

### Playwright scanner (`backend/src/services/scanner/`)

Modular pipeline:

| Module | Role |
|--------|------|
| `index.js` | BFS crawl orchestrator (max 5 pages, 90s timeout) |
| `pageScanner.js` | Navigate, collect console/network/a11y data |
| `networkTracker.js` | Failed requests and HTTP 4xx/5xx responses |
| `consoleTracker.js` | Deduped `console.error` / `pageerror` |
| `linkChecker.js` | Broken link sampling (first page, up to 30 links) |
| `accessibilityChecks.js` | Alt text, labels, duplicate IDs, `lang`, title |
| `screenshots.js` | Desktop 1440×900 + mobile 390×844 |
| `buildResult.js` | Structured JSON report + flat API payload |

Partial results are saved when a page fails, the global timeout is hit, or navigation only partially succeeds.

### SQLite database (`backend/data/qa-agent.db`)

- `scans` — aggregate scan metadata, score, screenshots, `public_token`
- `scan_pages` — per-page crawl results
- `issues` — findings linked to scans (and optionally pages)

---

## Quick start

### Option A — Docker (recommended)

**Requirements:** Docker Desktop or Docker Engine with Compose

```bash
git clone <repo-url>
cd MVP
npm install
npm start
```

Open **http://localhost:8080**

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:3000/api/health |

Stop: `npm run docker:down` · Background: `npm run docker:detached`

---

### Option B — Local development

**Requirements:** Node.js 18+

```bash
# 1. Install everything (Playwright Chromium installs via backend postinstall)
npm run install:all

# 2. Terminal 1 — backend
npm run dev:backend

# 3. Terminal 2 — frontend
npm run dev:frontend
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:3000 |

> **Restart the backend** after pulling code changes. A stale process on port 3000 may serve outdated API responses.

Optional: copy `.env.example` to `.env` in the project root and adjust paths/timeouts.

---

## Verify the stack

```bash
# Frontend production build
npm run build:frontend

# Backend audit (health, scan, SQLite, screenshots, public report, SSRF)
npm run audit

# Custom API base URL
node backend/scripts/audit-api.js http://localhost:3001
```

---

## Environment variables

See [`.env.example`](.env.example):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API port |
| `DATA_DIR` | `./data` | SQLite directory |
| `UPLOADS_DIR` | `./uploads` | Upload root |
| `SCREENSHOTS_DIR` | `./uploads/screenshots` | Screenshot output |
| `SCAN_TIMEOUT_MS` | `90000` | Global crawl timeout |
| `NAVIGATION_TIMEOUT_MS` | `20000` | Per-page navigation timeout |
| `MAX_LINKS_TO_CHECK` | `30` | Broken links sampled on first page |
| `SKIP_PLAYWRIGHT_INSTALL` | `0` | Set `1` in Docker after image build |

---

## Scenario & flow API (v0.4)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scenarios` | Create scenario `{ name, type, startUrl, config }` |
| `GET` | `/api/scenarios` | List scenarios |
| `GET` | `/api/scenarios/:id` | Scenario detail |
| `POST` | `/api/scenarios/:id/run` | Run scenario (returns `ScenarioRun`) |
| `GET` | `/api/scenario-runs/:id` | Run result with steps, issues, screenshot |

**Primary type:** `flow` — custom step-by-step journeys stored in `config.steps`.

**Legacy types:** `contact-form`, `cta-link`, `mobile-nav`, `broken-links`, `checkout-smoke`

### Flow step JSON

Each step is an object with an `action` field:

| Action | Fields |
|--------|--------|
| `goto` | `url` (optional — defaults to scenario `startUrl`) |
| `click` | `selector` and/or `text` |
| `fill` | `selector`, `value` |
| `waitForText` | `text`, optional `timeoutMs` |
| `expectUrlContains` | `value` |
| `expectVisible` | `selector` |
| `screenshot` | optional `label` |

Example:

```json
{
  "name": "Contact form flow",
  "type": "flow",
  "startUrl": "https://yoursite.com/contact",
  "config": {
    "steps": [
      { "action": "goto", "label": "Open contact page" },
      { "action": "fill", "selector": "#email", "value": "qa@example.com" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "waitForText", "text": "thank you" },
      { "action": "screenshot", "label": "Confirmation" }
    ]
  }
}
```

Each executed step returns `{ name, action, status, durationMs, message, screenshotPath? }`.

## Site scan API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/scans` | Start scan `{ "url": "https://example.com" }` |
| `GET` | `/api/scans` | List scan history |
| `GET` | `/api/scans/:id` | Full scan detail (internal use) |
| `GET` | `/api/reports/:token` | Public client report (no internal IDs) |

Static screenshots: `GET /uploads/screenshots/...`

---

## Example report

Public report shape (see [`docs/example-report.json`](docs/example-report.json)):

```json
{
  "token": "uuid-token",
  "url": "https://example.com",
  "score": 85,
  "summary": "Quality score: 85/100 — Found 3 issues across 2 pages",
  "criticalCount": 1,
  "warningCount": 2,
  "issues": [
    {
      "type": "console-error",
      "severity": "critical",
      "message": "Console error detected",
      "description": "A JavaScript error was logged in the browser console.",
      "recommendation": "Fix the script error causing the failure.",
      "affectedUrl": "https://example.com/page"
    }
  ]
}
```

Share link format: `https://your-host/report/<token>`

---

## Scoring

Deterministic quality score (0–100):

- Start at **100**
- **−15** per critical issue
- **−5** per warning
- **−1** per info issue
- Minimum **0**

---

## Error handling

| Scenario | HTTP | Behavior |
|----------|------|----------|
| Invalid JSON body | `400` | `{ "error": "Invalid JSON body." }` |
| Invalid / blocked URL | `400` | SSRF validation error + validation issue |
| Scan runtime failure | `500` | Failed scan persisted with error message |
| Global timeout (90s) | `201` | Partial report saved, `status: partial` |
| Single page failure | — | Crawl continues; page marked `failed` |
| Missing scan | `404` | `{ "error": "Scan not found." }` |
| Invalid public token | `400` | `{ "error": "Invalid report token." }` |
| Missing public report | `404` | `{ "error": "Report not found." }` |
| Unhandled server error | `500` | `{ "error": "Internal server error." }` |

**Frontend:** loading states, error banners, partial-scan warnings, and empty states for no issues / no history / no filter matches.

**Scanner:** navigation errors mark a page as `failed` or `partial`; network/console collection still runs when possible. Screenshots fail gracefully without aborting the scan.

---

## Limitations (v0.2)

- **No authenticated pages** — cannot scan login-protected or session-gated areas yet
- **Limited crawl depth** — same domain only, max 5 pages, BFS, 90s cap
- **No advanced security scanning** — no OWASP/ZAP-style penetration testing
- **Synchronous scans** — `POST /api/scans` blocks until Playwright finishes
- **Basic accessibility** — deterministic DOM checks, not a full WCAG / axe-core audit
- **Sampled link checks** — up to 30 links on the first page only
- **Chromium only** — no Firefox/WebKit matrix
- **No user authentication** — anyone with network access can run scans
- **Local storage** — SQLite + files on disk (or Docker volumes)

---

## Roadmap

### Near term
- [ ] Async scan jobs with progress polling / WebSocket
- [ ] Authenticated page scanning (cookie / header injection)
- [ ] axe-core integration for WCAG coverage
- [ ] CI/CD GitHub Action (scan on deploy preview)

### Medium term
- [ ] Scheduled re-scans and regression alerts
- [ ] Team workspaces and optional API keys
- [ ] Cloud deployment with object storage for screenshots
- [ ] Export report as downloadable PDF (server-side)

### Long term
- [ ] Cross-browser testing (Firefox, WebKit)
- [ ] Advanced security checks (headers, CSP, mixed content)
- [ ] Deeper crawl configuration (depth, include/exclude patterns)
- [ ] Multi-tenant SaaS with billing

---

## Project structure

```
MVP/
├── .env.example
├── README.md
├── docker-compose.yml
├── package.json
├── docs/
│   ├── example-report.json
│   └── screenshots/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── services/scanner/
│   │   ├── db/
│   │   └── utils/
│   └── scripts/audit-api.js
└── frontend/
    └── src/app/
```

---

## Security notes

- Only `http` and `https` URLs accepted
- Private/local addresses and metadata hosts blocked (SSRF)
- URLs with embedded credentials rejected
- Public reports use unguessable UUID tokens and omit internal IDs

---

## License

Private MVP — add license before open-sourcing.
