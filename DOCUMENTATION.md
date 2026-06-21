# Flow Test Agent — Product Documentation

**Current version:** 0.9.0  
**Product name:** Flow Test Agent (also referenced as Frontend QA Agent in API metadata)

> **For AI planning / feature brainstorming:** use [`AI_PRODUCT_BRIEF.md`](./AI_PRODUCT_BRIEF.md) — complete handoff document for v0.9 (page intent site map, multi-step flows, visual evidence, collection batch/monitor/compare).

Flow Test Agent is a Playwright-powered web quality and flow testing product. It helps teams test business-critical user journeys on live websites without writing code — while also supporting deeper manual control, site-wide technical scans, scheduled monitoring, and **automated website test discovery**.

> **Important:** Only test websites you own or have explicit permission to test. Checkout flows add items to cart but **never complete real payments**.

---

## Table of contents

1. [Product overview](#product-overview)
2. [Version history](#version-history)
3. [What you can do](#what-you-can-do)
4. [User interface & navigation](#user-interface--navigation)
5. [Architecture](#architecture)
6. [Database schema](#database-schema)
7. [API reference](#api-reference)
8. [Flow test execution](#flow-test-execution)
9. [Feature deep dives](#feature-deep-dives)
10. [Scheduled monitoring (v0.7)](#scheduled-monitoring-v07)
11. [Development & deployment](#development--deployment)
12. [Verification & testing](#verification--testing)
13. [Security](#security)
14. [Known limitations](#known-limitations)
15. [Project structure](#project-structure)

---

## Product overview

### The problem we solve

Manual flow testing is slow and requires technical knowledge: picking CSS selectors, defining success conditions, and knowing what to test. Flow Test Agent evolved from a basic scan + manual builder into an **intelligent flow testing product** that:

1. Analyzes a URL automatically
2. Suggests business-critical tests (forms, CTAs, cart, etc.)
3. Generates steps and success checks
4. Runs tests in a real browser
5. Scores reliability and explains failures in plain language
6. Optionally monitors flows on a schedule

### Two product modes

| Mode | Purpose |
|------|---------|
| **Flow Test Autopilot** | One-time intelligent flow tests from a URL (primary experience) |
| **Site Scans** | Multi-page technical QA crawl (console errors, broken links, a11y basics, performance signals) |
| **Monitoring** | Scheduled re-runs of saved flows with history, pass rate, and failure tracking |

---

## Version history

| Version | Theme | Highlights |
|---------|-------|------------|
| **v0.1–v0.3** | Site scans | Multi-page crawl, scored reports, public share links, scan comparison |
| **v0.4** | Flow scenarios | Custom flow steps, scenario runs, page inspector, visual preview |
| **v0.5** | Smart suggestions | URL analysis, auto-detect contact/CTA/newsletter/cart/menu patterns |
| **v0.6** | Flow Test Autopilot | Default autopilot UX, success condition assistant, reliability score, guided picker, challenge-aware preview, selector fallback |
| **v0.7** | Monitoring | Projects, scheduled flows, run history, pass rate dashboard |

Health endpoint feature flags (`GET /api/health`):

`scans`, `reports`, `scenarios`, `page-inspector`, `flow-wizard`, `flow-suggestions`, `flow-autopilot`, `success-condition-assistant`, `guided-element-picker`, `test-reliability-score`, `flow-recorder`, `selector-fallback`, `flow-monitoring`

---

## What you can do

### Flow Test Autopilot (primary)

- Enter any public URL on the home page
- Click **Generate tests** — the app opens the page in Playwright, captures a screenshot, and detects interactive elements
- Review **suggested tests** for:
  - Contact forms
  - Newsletter signup forms
  - Primary CTA buttons (up to 3)
  - Add to cart buttons
  - Checkout start buttons
  - Mobile menu toggles
  - Important broken link checks
- Each suggestion shows:
  - Title and plain-language description
  - Business value (“why this matters”)
  - Confidence level (high / medium / low)
  - Detected elements (human labels, not raw selectors)
  - Preview of generated steps
  - Suggested success conditions
  - **Test Reliability Score** (0–100)
- Click **Create & run test** — steps are generated, success signals are detected via dry run, test runs once, results appear inline
- Click **Customize** — full review with Success Condition Assistant, element picker, and reliability breakdown
- Advanced paths (wizard, recorder, advanced builder) are under **“Need more control?”**

### One-time flow testing (manual paths)

- **Advanced builder** (`/scenarios/new/advanced`) — full step-by-step JSON builder
- **Guided wizard** (`/scenarios/new/wizard`) — multi-step guided flow creation
- **Flow recorder** (`/scenarios/new/record`) — record interactions in the browser
- **Saved tests** (`/flows`) — list of previously created scenarios
- **Scenario detail** — view steps, reliability score, run again
- **Run results** — step-by-step outcomes, screenshots, plain-language failures, collapsed developer details

### Site scans (secondary)

- Enter a URL for a **multi-page crawl** (same domain, up to 5 pages, 90s timeout)
- Receive a **0–100 quality score** with critical / warning / info counts
- Review issues: console errors, failed network requests, broken links, basic accessibility, SEO basics
- Compare scans over time
- Share a **public client report** via unguessable token (no internal IDs exposed)
- Desktop (1440×900) and mobile (390×844) screenshots per scan

### Scheduled monitoring (v0.7)

- Create **monitoring projects** grouped by site/domain
- Import flows from existing scenarios
- Set schedule: **manual**, **every 6 hours**, **daily**, or **weekly**
- Background scheduler runs due flows automatically (checks every 60 seconds)
- View **pass rate**, average duration, last status, last failure, next scheduled run
- Flow detail page: run history chart, failed runs, screenshots, failure reasons, reliability score

---

## User interface & navigation

### Main navigation

| Nav item | Route | Description |
|----------|-------|-------------|
| **Test** | `/` | Flow Test Autopilot — URL input + Generate tests |
| **Saved** | `/flows` | List of saved one-time flow scenarios |
| **Monitoring** | `/projects` | Monitoring projects and scheduled flows |
| **Site Scans** | `/site-scans` | Start a full-site technical scan |

### All routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Flow Test Autopilot | Default landing — analyze URL, suggest tests, create & run |
| `/flows` | Saved tests | Previously created scenarios |
| `/scenarios/new` | Redirect | Redirects to `/` |
| `/scenarios/new/wizard` | Guided wizard | Step-by-step flow builder |
| `/scenarios/new/record` | Flow recorder | Record user interactions |
| `/scenarios/new/advanced` | Advanced builder | Manual step JSON builder |
| `/scenarios/:id` | Scenario detail | View/edit saved scenario |
| `/scenario-runs/:id` | Run result | Full run outcome with steps and screenshots |
| `/projects` | Project list | Monitoring projects |
| `/projects/:id` | Project dashboard | Flows, pass rate, failures, next run |
| `/monitoring/flows/:id` | Monitored flow detail | Schedule, history, reliability |
| `/site-scans` | Scan home | Start site scan |
| `/history` | Scan history | Past scans list |
| `/scans/:id` | Scan detail | Full scan report |
| `/scans/:id/compare/:previousId` | Scan compare | Diff two scans |
| `/report/:token` | Public report | Client-facing report (no app chrome) |

### UX principles

- **Plain language first** — non-technical users see human labels, not CSS selectors
- **Developer details collapsed** — selectors, attempt logs, and technical metadata are opt-in
- **Honest preview status** — blocked/challenge pages show clear warnings, never fake “success”
- **Autopilot first, manual second** — advanced tools exist but are not the default path

---

## Architecture

```
┌─────────────────────┐     REST /api       ┌──────────────────────┐
│  Angular 19 SPA     │ ◄─────────────────► │  Express 4 API       │
│  :4200 / :8080      │     /uploads        │  :3000 / :3100       │
└─────────────────────┘                     └──────────┬───────────┘
                                                       │
         ┌─────────────────────────────────────────────┼─────────────────────────────┐
         ▼                         ▼                    ▼                             ▼
  ┌─────────────┐          ┌─────────────┐      ┌─────────────┐              ┌─────────────┐
  │ SQLite DB   │          │ Playwright  │      │ Scheduler   │              │ Screenshots │
  │ better-     │          │ Chromium    │      │ (setInterval│              │ /uploads    │
  │ sqlite3     │          │ headless    │      │  60s tick)  │              │             │
  └─────────────┘          └─────────────┘      └─────────────┘              └─────────────┘
```

### Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Angular 19 (standalone components) |
| Backend | Node.js, Express 4 |
| Browser automation | Playwright (Chromium) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Deployment | Docker Compose + nginx |

### Backend services (key modules)

| Module | Path | Role |
|--------|------|------|
| Scanner | `backend/src/services/scanner/` | Multi-page BFS crawl, console/network/a11y checks |
| Scenarios | `backend/src/services/scenarios/` | Flow execution, dry run, reliability scoring |
| Flow suggestions | `backend/src/services/flowSuggestions/` | URL analysis → smart test suggestions |
| Page inspector | `backend/src/services/pageInspector/` | Screenshot, element extraction, challenge detection |
| Monitoring | `backend/src/services/monitoring/` | Projects, schedules, scheduler, run history |
| Repositories | `backend/src/services/*Repository.js` | SQLite CRUD |

### Frontend structure

| Area | Path | Role |
|------|------|------|
| Autopilot | `frontend/src/app/pages/scenario-smart-flow/` | Main product experience |
| Components | `frontend/src/app/components/` | Reusable UI (picker, reliability, success assistant) |
| Services | `frontend/src/app/services/` | HTTP API clients |
| Utils | `frontend/src/app/utils/` | Flow templates, suggestion conversion, formatting |

---

## Database schema

Database file: `backend/data/qa-agent.db` (or `$DATA_DIR/qa-agent.db`)

Schema is applied at startup via `CREATE TABLE IF NOT EXISTS` plus incremental `ALTER TABLE` migrations in `backend/src/db/database.js`.

### Site scans

| Table | Purpose |
|-------|---------|
| `scans` | Scan metadata, score, screenshots, public token, summary |
| `scan_pages` | Per-page crawl results within a scan |
| `issues` | Findings linked to scans (and optionally pages) |

### One-time flow tests

| Table | Purpose |
|-------|---------|
| `scenarios` | Saved flow definitions (`name`, `type`, `start_url`, `config_json`) |
| `scenario_runs` | Execution history per scenario (status, score, result JSON, screenshot) |

### Monitoring (v0.7)

| Table | Purpose |
|-------|---------|
| `projects` | Monitoring project (`name`, `domain`) |
| `flows` | Monitored flow (`project_id`, steps, success conditions, `schedule`, `is_active`, `next_run_at`) |
| `flow_runs` | Scheduled/manual run history (`status`, `duration_ms`, `failure_reason`, `result_json`) |

---

## API reference

Base URL: `http://localhost:3000` (local) or `http://localhost:3100` (Docker mapped port)

### Health

```
GET /api/health
```

Returns `{ status, service, version, features[] }`.

---

### Site scans

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scans` | Start scan `{ "url": "https://example.com" }` |
| `GET` | `/api/scans` | List scan history |
| `GET` | `/api/scans/:id` | Full scan detail (internal) |
| `GET` | `/api/reports/:token` | Public report (no internal IDs) |

Static screenshots: `GET /uploads/screenshots/...`

**Scan scoring:** Start at 100, −15 per critical, −5 per warning, −1 per info (minimum 0).

---

### Scenarios (one-time flows)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scenarios` | Create scenario |
| `GET` | `/api/scenarios` | List scenarios |
| `GET` | `/api/scenarios/:id` | Scenario detail |
| `POST` | `/api/scenarios/:id/run` | Run scenario |
| `POST` | `/api/scenarios/reliability-score` | Score test reliability 0–100 |
| `GET` | `/api/scenario-runs/:id` | Run result with steps, issues, screenshot |

**Scenario types:** `flow` (primary), plus legacy types: `contact-form`, `cta-link`, `mobile-nav`, `broken-links`, `checkout-smoke`.

---

### Flow suggestions (Autopilot)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/flow-suggestions/analyze` | Analyze URL, return suggestions + page inspection |

Request:

```json
{ "url": "https://example.com", "viewport": "desktop" }
```

Response includes: `suggestions[]`, `elements[]`, `screenshotPath`, `status`, `warnings[]`, `timing`.

---

### Success condition assistant

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/flows/dry-run-analyze` | Dry-run flow steps, detect success signals |

Request:

```json
{
  "startUrl": "https://example.com",
  "steps": [ /* action steps only */ ],
  "viewport": { "width": 1440, "height": 900 }
}
```

Detects: URL change, URL path, success text, network POST 2xx, new visible elements, form reset, cart count change, toast/alert messages.

---

### Page inspector

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/page-inspector/inspect` | Screenshot + classified interactive elements |

Returns elements with: `category`, `importance`, `humanLabel`, `businessMeaning`, `suggestedActions`, `explanation`, bounding boxes, selectors (for developer mode).

**Element categories:** primary-cta, secondary-cta, submit-button, email-input, name-input, message-input, mobile-menu-button, add-to-cart, checkout, navigation-link, newsletter, form-input, unknown.

---

### Monitoring (v0.7)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List projects with stats |
| `POST` | `/api/projects` | Create project `{ name, domain }` |
| `GET` | `/api/projects/:id` | Project dashboard (flows + stats) |
| `GET` | `/api/monitoring/flows/schedules` | List valid schedule values |
| `POST` | `/api/monitoring/flows` | Create flow (manual or from `scenarioId`) |
| `GET` | `/api/monitoring/flows/:id` | Flow detail + recent runs + reliability |
| `PATCH` | `/api/monitoring/flows/:id` | Update schedule, active state, steps |
| `POST` | `/api/monitoring/flows/:id/run` | Run flow now and record result |
| `GET` | `/api/monitoring/flows/:id/runs` | Run history |
| `GET` | `/api/monitoring/flow-runs/:id` | Single run detail |

**Schedules:** `manual`, `every-6-hours`, `daily`, `weekly`

---

## Flow test execution

### Flow step actions

Each step in `config.steps` has an `action` field:

| Action | Fields | Description |
|--------|--------|-------------|
| `goto` | `url` (optional) | Navigate to URL |
| `click` | `selector`, `text`, `targetRole`, `selectorAlternatives` | Click element |
| `fill` | `selector`, `value` | Fill input |
| `waitForText` | `text`, `timeoutMs` | Assert page contains text |
| `expectUrlContains` | `value` | Assert URL contains string |
| `expectVisible` | `selector` | Assert element visible |
| `expectNetworkSuccess` | `value`, `timeoutMs` | Assert POST/PUT/PATCH returned 2xx |
| `screenshot` | `label` | Capture screenshot |

### Selector fallback chain

When a primary selector fails, the runner tries in order:

1. Primary selector
2. Alternative selectors (`selectorAlternatives`)
3. Text-based match (`text=` / `targetText`)
4. Role-based match (`targetRole`)

Each step result records `selectorStrategy`, `attempts[]`, and plain-language failure messages.

### Example flow scenario

```json
{
  "name": "Contact form test",
  "type": "flow",
  "startUrl": "https://yoursite.com/contact",
  "config": {
    "steps": [
      { "action": "goto", "label": "Open contact page" },
      { "action": "fill", "selector": "[data-testid=email]", "value": "qa@example.com", "label": "Fill email" },
      { "action": "click", "selector": "text=Submit", "label": "Submit form" },
      { "action": "waitForText", "text": "thank you", "label": "Check success message" },
      { "action": "screenshot", "label": "Capture confirmation" }
    ]
  }
}
```

### Run result shape

Each executed step returns:

```json
{
  "name": "Submit form",
  "action": "click",
  "status": "passed",
  "durationMs": 842,
  "message": "Clicked Submit",
  "selectorStrategy": "primary",
  "attempts": [],
  "screenshotPath": "/uploads/screenshots/..."
}
```

---

## Feature deep dives

### 1. Smart test suggestions (v0.5 / v0.6)

**Backend:** `backend/src/services/flowSuggestions/`

- `extractPageContext.js` — parses forms and interactive elements from page
- `buildSuggestions.js` — builds suggestion objects per pattern type
- `suggestionMeta.js` — enriches with business value, reasons, success conditions
- `index.js` — orchestrates page load, mobile pass for menu detection, returns analysis

**Suggestion types detected:**

| Type | What it finds |
|------|---------------|
| `contact-form` | Forms with name/email/message + submit |
| `newsletter` | Email + subscribe/signup patterns |
| `cta` | Prominent call-to-action buttons (max 3) |
| `add-to-cart` | Add to cart / add to bag buttons |
| `checkout-start` | Checkout / proceed buttons |
| `mobile-menu` | Hamburger / menu toggle (mobile viewport pass) |
| `broken-links` | Link smoke check scenario |

---

### 2. Success Condition Assistant (v0.6.1)

**Backend:**

- `dryRunAnalyzer.js` — executes action steps, captures before/after page state
- `capturePageState.js` — snapshots URL, visible text, forms, toasts, cart count, buttons
- `detectSuccessSignals.js` — compares before/after, emits ranked suggestions

**Frontend:** `SuccessConditionAssistantComponent`

- Runs dry analysis automatically when steps change
- Shows before/after screenshots
- Presents success checks in plain language with confidence badges
- User selects checks; selected checks become assertion steps
- Developer details toggle for technical metadata

**Create & run integration:** One-click path runs a quick dry run before the full test to pick the best success signal automatically.

---

### 3. Test Reliability Score (v0.6.3)

**Backend:** `testReliabilityScore.js`  
**Frontend:** `TestReliabilityScoreComponent`

Scores each test **0–100** based on weighted factors:

| Factor | Weight | What it measures |
|--------|--------|------------------|
| Selector stability | 35% | data-testid vs fragile class/id selectors |
| Success condition quality | 30% | Presence and strength of assertions |
| Step completeness | 20% | goto, actions, assertions, screenshot |
| Flakiness risk | 15% | Timeouts, dynamic selectors, missing fallbacks |

**Badge thresholds:**

- **High** — score ≥ 75
- **Medium** — score ≥ 50
- **Low** — score < 50

Returns: score, badge, summary explanation, improvement suggestions, optional factor breakdown.

Shown on: suggestion cards, customize view, scenario detail, wizard, recorder, advanced builder, monitoring flow detail.

---

### 4. Guided visual picker (v0.6.2)

**Backend:** `classifyElement.js`, `extractElements.js`  
**Frontend:** `PagePreviewPickerComponent`, `element-guide.util.ts`

- Loads page screenshot with element overlays
- Classifies each element with category, importance, business meaning
- Filters: All / Important / by category
- Sidebar list sorted by importance (high first)
- Click to highlight element with plain-language explanation
- **Selectors hidden** unless “Show developer details” is enabled
- Used in autopilot sidebar, wizard, customize view, element correction

---

### 5. Preview reliability (v0.6)

**Backend:** `challengeDetection.js`, `loadPage.js`

Detects bot protection / challenge pages:

- “Checking your browser”
- “Just a moment”
- “Verify you are human”
- Cloudflare patterns
- Low-content pages after load

**Behavior:**

- Waits and retries (up to 2 challenge retries, 5s wait)
- 45s max load timeout
- Returns honest status: `ok`, `partial`, `blocked`, `timeout`, `error`
- Never pretends preview loaded correctly when blocked

**Frontend:**

- Status label on analysis panel
- Warning cards with retry / try mobile / continue manually / run site scan options
- Challenge-detected flag shown when retries occurred

---

### 6. Flow recorder (v0.5+)

**Route:** `/scenarios/new/record`

Records user interactions in a live browser session and converts them to flow steps. Includes reliability score on review.

---

### 7. Selector fallback (v0.6)

**Backend:** `selectorFallback.js`, integrated in `flowRunner.js`

Automatic fallback chain with attempt logging. Failures include human-readable messages via `humanizeError.js`.

---

## Scheduled monitoring (v0.7)

Turns the app from a one-time tester into a monitoring product.

### Concepts

```
Project (site/domain)
  └── Flow (monitored test with schedule)
        └── FlowRun (execution history)
```

### Scheduler

**File:** `backend/src/services/monitoring/scheduler.js`

- Starts automatically when the API boots
- `setInterval` every **60 seconds**
- Queries flows where `is_active = 1`, `schedule != 'manual'`, and `next_run_at <= now`
- Runs up to 10 due flows per tick (sequential, no overlap)
- Records result, updates `last_run_at` and `next_run_at`

### Monitoring stats

Per flow and per project:

- **Pass rate** — percentage of runs with `status = passed`
- **Average duration** — mean `duration_ms`
- **Last run** — most recent status and timestamp
- **Last failure** — most recent non-passed run with `failure_reason`
- **Next scheduled run** — computed from schedule after each run

### Frontend pages

- **Project list** — create projects, see flow count and pass rate
- **Project dashboard** — flow table with last status, pass rate, last failure, next run; import from saved scenarios
- **Flow detail** — schedule settings, reliability score, run history chart, failed runs, screenshots

---

## Development & deployment

### Quick start — Docker (recommended)

```bash
git clone <repo-url>
cd MVP
npm install
npm start
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:3100/api/health |

Stop: `npm run docker:down`

> **Note:** Docker backend maps host port **3100** → container **3000**. Ensure Playwright Docker image version matches installed Playwright (see `backend/Dockerfile`).

### Local development

```bash
npm run install:all

# Terminal 1
npm run dev:backend

# Terminal 2
npm run dev:frontend
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:4200 |
| Backend | http://localhost:3000 |

Restart the backend after pulling code changes.

### NPM scripts (root)

| Script | Description |
|--------|-------------|
| `npm start` | Docker Compose up --build |
| `npm run install:all` | Install backend + frontend dependencies |
| `npm run dev:backend` | Backend with `--watch` |
| `npm run dev:frontend` | Angular dev server |
| `npm run build:frontend` | Production Angular build |
| `npm run audit` | Backend API audit script |

### Environment variables

See `.env.example`:

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

## Verification & testing

### Frontend build

```bash
npm run build:frontend
```

Output: `frontend/dist/frontend`

### Backend audit

```bash
npm run audit
# or with custom port:
node backend/scripts/audit-api.js http://localhost:3100
```

The audit script validates:

- Health check
- Site scan create, screenshots, history, detail, public report, SSRF blocking
- Scenario create and run
- Flow scenario with selector fallback
- Page inspector
- Flow suggestions
- Dry-run success analysis
- Reliability score
- Monitoring project/flow CRUD, schedule update, run, history

---

## Security

- Only `http` and `https` URLs accepted
- Private/local addresses and metadata hosts blocked (SSRF protection in `urlValidator.js`)
- URLs with embedded credentials rejected
- Public reports use UUID tokens and omit internal database IDs
- No authentication yet — anyone with network access can run scans/tests
- No payments — checkout tests never complete real transactions

---

## Known limitations

| Area | Limitation |
|------|------------|
| Authentication | Cannot scan or test login-protected pages |
| Crawl depth | Same domain only, max 5 pages, 90s cap |
| Security scanning | No OWASP/ZAP-style penetration testing |
| Scan execution | Synchronous — POST blocks until Playwright finishes |
| Accessibility | Basic DOM checks, not full WCAG / axe-core |
| Link checks | Up to 30 links on first page only |
| Browser | Chromium only (no Firefox/WebKit matrix) |
| Multi-tenancy | No user accounts, teams, or billing |
| Storage | Local SQLite + filesystem (Docker volumes in production) |
| Scheduler | Simple `setInterval` — no distributed queue |
| Bot protection | Challenge pages may block analysis; app reports honestly but cannot bypass |

---

## Project structure

```
MVP/
├── DOCUMENTATION.md          ← This file
├── README.md                 ← Quick start (partially outdated — see DOCUMENTATION.md)
├── docker-compose.yml
├── package.json
├── .env.example
├── docs/
│   └── example-report.json
├── backend/
│   ├── src/
│   │   ├── server.js         ← Express app + scheduler boot
│   │   ├── config.js
│   │   ├── db/database.js    ← Schema + migrations
│   │   ├── routes/           ← API route handlers
│   │   ├── services/
│   │   │   ├── scanner/      ← Site scan pipeline
│   │   │   ├── scenarios/    ← Flow execution, dry run, reliability
│   │   │   ├── flowSuggestions/
│   │   │   ├── pageInspector/
│   │   │   └── monitoring/   ← Projects, scheduler, run history
│   │   └── utils/
│   └── scripts/audit-api.js
└── frontend/
    └── src/app/
        ├── app.routes.ts
        ├── app.component.*
        ├── pages/            ← Route-level page components
        ├── components/       ← Shared UI (picker, reliability, etc.)
        ├── services/         ← API clients
        ├── models/           ← TypeScript interfaces
        └── utils/            ← Flow templates, helpers
```

---

## Typical user journeys

### Journey 1: Quick flow test (Autopilot)

1. Open `/` → enter `https://yoursite.com`
2. Click **Generate tests**
3. Review suggestions → click **Create & run test** on “Contact form”
4. See inline pass/fail result with screenshot
5. Optionally click **Customize** to refine success checks

### Journey 2: Manual advanced test

1. Open `/` → **Need more control?** → **Advanced builder**
2. Build steps manually with visual picker
3. Save and run → view result at `/scenario-runs/:id`

### Journey 3: Site quality scan

1. Nav → **Site Scans**
2. Enter URL → run scan
3. Review score, issues, screenshots
4. Share public report link with client

### Journey 4: Scheduled monitoring

1. Nav → **Monitoring** → create project
2. **Add flow** from a saved scenario
3. Set schedule to **Daily** → save
4. Scheduler runs automatically; check pass rate and failures on dashboard

---

## License

Private MVP — add license before open-sourcing.
