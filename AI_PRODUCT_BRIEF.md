# Flow Test Agent — Complete Product Brief (v0.9.0)

> **Purpose of this document:** Paste this entire file into an AI assistant to brainstorm new features, UX improvements, architecture changes, or prioritization. It describes what exists today, how it works, and what is intentionally not built yet.

---

## 1. Product summary

**Flow Test Agent** (package name: `frontend-qa-agent`, v0.9.0) is a Playwright-powered SaaS-style web QA product. Users paste a URL; the system explores the site like a cautious QA engineer, builds a **site map with page intent**, discovers testable behavior, composes **multi-step flows**, suggests tests with **visual evidence**, saves them into domain-scoped **Test Collections**, runs them in a real browser, scores reliability, and optionally monitors them on a schedule.

**Core promise:** *"Paste a URL. We explore the site safely, understand what each page is for, discover what can be tested, and suggest complete flows you can save, run, and monitor."*

**Stack:** Angular 19 SPA + Express 4 API + Playwright (Chromium) + SQLite (`better-sqlite3`) + Docker Compose (nginx frontend, Node backend).

**Important constraints:**
- Only test sites you own or have permission to test
- Never complete real payments or destructive account actions
- Discovery/analyzer logic must be **generic** — no hardcoded demo-site URLs or page-specific rules in product code
- Deterministic logic first — no required AI/LLM APIs for discovery

---

## 2. Product modes (what the app does)

| Mode | Primary route | Purpose |
|------|---------------|---------|
| **Website Test Analyzer** | `/` | Multi-page safe reconnaissance → page intent → action graph → multi-step flow suggestions → visual evidence → save to collection |
| **Quick analyze (1 page)** | `/` | Pattern-based suggestions (forms, CTAs, cart, menu) from single-page inspection |
| **Test Collections** | `/collections`, `/collections/:id` | Domain-scoped test suites; batch run/delete/monitor/tag; analyzer settings; run comparison |
| **Saved tests** | `/flows` | All saved scenarios (manual + generated) |
| **Site Scans** | `/site-scans` | Multi-page technical QA crawl (console, links, a11y basics, score) |
| **Monitoring** | `/projects` | Scheduled re-runs of saved flows with history and pass rate |
| **Manual builders** | `/scenarios/new/wizard`, `/record`, `/advanced` | Guided wizard, recorder, JSON step builder |

---

## 3. Version history (high level)

| Version | Theme |
|---------|-------|
| v0.1–v0.3 | Site scans, scored reports, public share links, scan comparison |
| v0.4 | Flow scenarios, page inspector, visual picker |
| v0.5 | Smart single-page suggestions (forms, CTAs, cart, newsletter) |
| v0.6 | Flow Test Autopilot UX, success condition assistant, reliability score, selector fallback |
| v0.7 | Monitoring projects, scheduled flows, pass rate dashboard |
| v0.8 | Website Test Analyzer, async discovery jobs, multi-interaction probing, Test Collections bulk run/delete |
| **v0.9** | **Page intent site map**, **action graph + multi-step flow composer**, **before/after visual evidence**, **improved dynamic-loading probe**, **smart no-results debugger**, **collection analyzer settings**, **batch collection actions**, **monitor-from-collection workflow**, **analyzer run comparison** |

Health endpoint: `GET /api/health` → `version: "0.9.0"`, features include `website-test-analyzer`, `test-collections`, `multi-page-discovery`, `safe-action-probing`.

---

## 4. Website Test Analyzer (v0.9 flagship)

### User flow

1. User enters URL on home page (`/`)
2. Chooses depth: **Quick** / **Standard** / **Deep**
3. Optional: include subpages, advanced limits (`maxPages`, `maxActionsPerPage`)
4. Clicks **Analyze website**
5. Async job runs with live progress (bar, stage, stats, cancel)
6. Results show:
   - **Site map** — analyzed pages with intent badges (contact, login, pricing, etc.)
   - **Suggestions** grouped by source page path
   - **Multi-step flow** badges where composed flows were generated
   - **Before/after visual evidence** on probed interactions
   - **Smart no-results** panel if nothing safe was found
7. User can: Add to collection, Add & run, Ignore, Add all safe tests
8. Tests saved into a **Test Collection** keyed by domain/origin
9. Analyzer run summary stored in collection history for later comparison

### Depth presets

| Mode | Pages | Actions/page | Subpages |
|------|-------|--------------|----------|
| Quick | 1 | 10 | No |
| Standard | 10 | 25 | Yes |
| Deep | 25 | 50 | Yes |

Collection **analyzer settings** can override default `maxPagesDefault` and `maxActionsDefault`.

### Analyzer pipeline (backend)

Orchestrated in `backend/src/services/testDiscovery/discoveryService.js`:

1. **Create/reuse collection** for normalized domain/origin
2. **Load collection analyzer settings** — keywords, ignored paths, preferred types, risk level
3. **Load start URL** — `domcontentloaded` + brief stabilization
4. **Page usability check** — visual/card pages OK without buttons/forms
5. **Extract internal links** — same origin; filter ignored paths from settings
6. **Score & select pages** — `scoreLinks.js` + collection `importantKeywords` boost
7. **Per-page analysis:**
   - `analyzePage()` — legacy single-page pattern suggestions (start page only)
   - `explorePageBehavior()` — safe interaction probing with visual evidence + dynamic-loading probe
   - `classifyPageIntent()` — site map entry per page
8. **Find candidate actions** — `candidateActionFinder.js`
9. **Classify safety** — `safeActionClassifier.js`
10. **Probe actions** — reload page, before/after screenshots, multi-phase dynamic loading probe
11. **Diff states** — `pageStateDiff.js`
12. **Classify behavior** — `behaviorClassifier.js`
13. **Generate suggestions** — `testSuggestionGenerator.js`
14. **Build action graph** — `actionGraphBuilder.js`
15. **Compose multi-step flows** — `flowComposer.js` (2–6 steps, one success condition)
16. **Score with collection preferences** — boost preferred types/keywords
17. **Deduplicate** — deterministic signature
18. **Build no-results report** if zero suggestions — `noResultsDebugger.js`
19. **Record analyzer run** in collection history
20. **Return** siteMap, actionGraph, grouped suggestions, noResults

### New v0.9 modules

| Module | Role |
|--------|------|
| `pageIntentClassifier.js` | Classify page intent from URL, title, headings, forms, behaviors (no URL-specific product logic) |
| `actionGraphBuilder.js` | Nodes: page, element, action, behavior, assertion, navigation; edges from observed diffs |
| `flowComposer.js` | Chain behaviors into contact journey, product quick view, add-to-cart, login validation, dynamic loading flows |
| `visualEvidence.js` | Before/after screenshots + changed region estimate + plain-language summary |
| `dynamicLoadingProbe.js` | Multi-phase probe: immediate → intermediate → final; detects loading phase + final content |
| `noResultsDebugger.js` | Structured explanation when zero suggestions |
| `collectionAnalyzerSettings.js` | Per-collection preferences, scoring boost, run history, run comparison |

### Page intents (site map)

`homepage`, `contact`, `lead-generation`, `login`, `signup`, `product`, `ecommerce`, `cart`, `checkout-start`, `pricing`, `booking`, `search`, `dashboard`, `content/article`, `documentation`, `demo-interactive`, `unknown`

Per page returns:
```json
{
  "url": "...",
  "path": "/contact",
  "title": "...",
  "intent": "contact",
  "intentConfidence": "high",
  "reasons": ["Page contains email and message fields"],
  "importance": "high"
}
```

### Candidate interaction types probed

| Type | Examples |
|------|----------|
| Click | buttons, links, tabs, accordions, modals, toggles |
| Hover | cards, figures, nav items, elements with hidden descendants |
| Fill | text, email, search, textarea (safe dummy values only) |
| Select | native `<select>`, combobox-like controls |
| Check/radio | checkboxes, radios, switches |
| Keyboard | search inputs, keypress handlers (bounded safe keys) |
| Navigate | internal links, nav, CTAs |

### Behavior types classified (from observed diffs, not URL rules)

`hover-reveal`, `dynamic-element-created`, `dynamic-element-created-and-removable`, `toggle-visibility`, `expand-collapse`, `modal-open-close`, `dropdown-selection`, `checkbox-toggle`, `radio-selection`, `dynamic-loading`, `navigation`, `form-validation`, `login-error`, `text-update`, `keyboard-response`, `search-results-update`, `tab-switch`, `menu-open-close`, `color-input-changed`, `range-input-changed`, `ui-state-changed`

### Safety levels (every suggestion)

| Level | Meaning |
|-------|---------|
| `safe` | Auto-probe OK (hover, toggle, checkbox, internal nav) |
| `safe-generated-element` | Delete/remove OK if element appeared in isolated session |
| `requires-confirmation` | Contact form submit, login, newsletter — user must confirm before run |
| `unsafe-skipped` | Pay, delete account, logout, file upload — never auto-probed |

### Suggestion shape (key fields — v0.9)

```json
{
  "id": "...",
  "title": "...",
  "type": "hover-reveal",
  "sourceUrl": "...",
  "description": "...",
  "businessValue": "...",
  "flowSummary": "Hover product card, click quick action, verify modal opens",
  "pagesInvolved": ["/", "/products"],
  "isComposedFlow": true,
  "pageIntent": "product",
  "confidence": 0.88,
  "confidenceLevel": "high",
  "safetyLevel": "safe",
  "discoveredBehavior": { "summary": "...", "type": "..." },
  "generatedSteps": [ /* flow steps */ ],
  "whySuggested": ["..."],
  "reliabilityScore": 85,
  "visualEvidence": {
    "beforeScreenshotPath": "/uploads/...",
    "afterScreenshotPath": "/uploads/...",
    "changedRegion": { "x": 0, "y": 0, "width": 100, "height": 80 },
    "summary": "Hidden content became visible after hover."
  }
}
```

### Discovery result shape (v0.9 additions)

```json
{
  "siteMap": [ /* PageIntentEntry[] */ ],
  "actionGraph": { "nodes": [], "edges": [] },
  "noResults": {
    "summary": "No reliable safe test suggestions were found.",
    "attempted": { "pagesAnalyzed": 4, "clickCandidates": 8, "actionsProbed": 11 },
    "reasons": ["Hover candidates did not reveal visible content."],
    "nextSteps": ["Try Deep analysis", "Increase max actions per page"]
  },
  "summary": { "composedFlows": 2, "attemptSummary": {} }
}
```

### Async job API (primary)

```
POST /api/analyzer/jobs
GET  /api/analyzer/jobs/:id
GET  /api/analyzer/jobs/:id/result
POST /api/analyzer/jobs/:id/cancel
GET  /api/analyzer/depth-presets
```

### Progress stages

Includes new stage: `composing-flows` — between deduplication and completion.

Full chain: `queued` → `creating-collection` → `loading-start-url` → `checking-page-usability` → `extracting-internal-links` → `selecting-pages-to-analyze` → `crawling-page` → `inspecting-page-structure` → `finding-candidate-actions` → probing stages → `comparing-page-states` → `classifying-behaviors` → `deduplicating-suggestions` → **`composing-flows`** → `generating-test-suggestions` → `completed` | `partial` | `failed` | `cancelled`

### No-results messaging (v0.9)

Structured `noResults` object with attempted counts, reasons, and recommended next steps. UI shows three columns: what we attempted, why nothing was suggested, what to try next.

---

## 5. Test Collections (v0.9)

### Concept

- One collection per **origin/domain**
- Auto-created when analyzer runs on a URL
- Stores generated + accepted tests as `scenarios` linked via `collection_id`
- Tests grouped by source page path in UI
- Duplicate detection via deterministic `test_signature`
- **Analyzer settings** stored in `metadata_json.analyzerSettings`
- **Analyzer history** stored in `metadata_json.analyzerHistory` (last 20 runs)
- **Monitored scenario IDs** and **test tags** in collection metadata

### Collection detail page (`/collections/:id`)

**Tabs:** Generated tests | Runs | Monitoring | **Analyzer history** | Settings

**Header bulk actions:**
- Run all tests (backend `POST .../run-all`)
- Remove all tests
- Analyze again (uses collection analyzer settings for depth)
- Generate more tests / Delete collection

**Generated tests tab (v0.9):**
- Select filtered / select all filtered
- **Run selected** — `POST .../run-selected`
- **Delete selected** — `DELETE .../tests/batch`
- **Monitor selected** — modal with schedule (daily / weekly / every 6 hours) + optional alert email → creates monitoring project + flows → navigates to project dashboard
- **Tag selected** — `POST .../tag-tests`
- **Filters:** page, type, safety, last status, monitored/not monitored, min confidence %

**Settings tab:**
- Collection name/description
- **Analyzer preferences:** important keywords, ignored paths, preferred test types, allowed risk level, default max pages/actions, optional alert email

**Analyzer history tab:**
- List of past runs with suggestion counts
- **Compare latest vs previous** — `GET .../analyzer-comparison` (new/removed suggestions, changed page intents, unreachable pages)

### Collection API (v0.9)

```
GET    /api/test-collections
POST   /api/test-collections/from-url
GET    /api/test-collections/:id
PATCH  /api/test-collections/:id
DELETE /api/test-collections/:id?deleteTests=true|false
POST   /api/test-collections/:id/add-suggestions
POST   /api/test-collections/:id/run-all
POST   /api/test-collections/:id/run-selected
DELETE /api/test-collections/:id/tests
DELETE /api/test-collections/:id/tests/batch
POST   /api/test-collections/:id/monitor-selected
POST   /api/test-collections/:id/tag-tests
GET    /api/test-collections/:id/analyzer-settings
PATCH  /api/test-collections/:id/analyzer-settings
GET    /api/test-collections/:id/analyzer-comparison
```

---

## 6. Flow Test Autopilot (single-page quick analyze)

Route: `/` → button **Quick analyze (1 page)**

Uses `POST /api/flow-suggestions/analyze` — pattern detection without multi-page probing.

**Suggestion types:** contact-form, newsletter, primary-cta, add-to-cart, checkout-start, mobile-menu, broken-links

Each suggestion includes: title, business value, confidence, detected elements, generated steps, success conditions, reliability score.

Actions: Create & run, Customize (Success Condition Assistant + visual picker), Preview steps.

---

## 7. Flow runner (Playwright execution)

**Module:** `backend/src/services/scenarios/flowRunner.js`  
**Step definitions:** `backend/src/services/scenarios/flowSteps.js`

### Supported step actions

| Action | Purpose |
|--------|---------|
| `goto` | Navigate to URL |
| `click` | Click element |
| `hover` | Hover element (for hover-reveal tests) |
| `fill` | Fill input (also handles select via tag detection) |
| `select` | Select dropdown option |
| `check` / `uncheck` | Checkbox/switch |
| `press` | Keyboard key (optionally focused on element) |
| `waitForText` | Wait for visible text |
| `expectUrlContains` | Assert URL fragment |
| `expectVisible` | Assert element visible |
| `expectHidden` / `expectNotVisible` | Assert element hidden |
| `expectValue` | Assert input value |
| `expectChecked` | Assert checked state |
| `expectNetworkSuccess` | Assert 2xx network response |
| `screenshot` | Capture screenshot |

### Selector fallback chain

1. Primary `selector`
2. `selectorAlternatives[]`
3. Text match (`targetText`)
4. Role + name (`targetRole`, `targetLabel`)
5. Aria-label

---

## 8. Site Scans (technical QA)

Route: `/site-scans` — multi-page BFS crawl, scored 0–100, public reports, compare scans.

---

## 9. Monitoring (scheduled flows)

Routes: `/projects`, `/projects/:id`, `/monitoring/flows/:id`

- Create/reuse project by domain when monitoring from collection
- Import flows from saved scenarios via `createFlowFromScenario`
- Schedules: `manual`, `every-6-hours`, `daily`, `weekly`
- Optional alert email stored on collection metadata (UI ready; email delivery not implemented)

---

## 10. Other supporting features

| Feature | Description |
|---------|-------------|
| **Page inspector** | Screenshot + classified interactive elements |
| **Visual picker** | Click elements on preview to fix selectors |
| **Success Condition Assistant** | Dry-run steps, detect success signals |
| **Test Reliability Score** | 0–100 heuristic |
| **Challenge detection** | Bot protection retry/wait |
| **Humanized errors** | Plain-language failures + collapsed dev details |

---

## 11. Architecture

```
Angular 19 SPA (:4200 dev, :8080 Docker/nginx)
        │  REST /api/*  +  /uploads/*
        ▼
Express 4 API (:3000 dev, :3100 Docker)
        │
   ┌────┴────┬──────────────┬─────────────┐
   ▼         ▼              ▼             ▼
 SQLite   Playwright    Job queue     uploads/
 (WAL)    Chromium      (setImmediate  screenshots/
                         + SQLite)     videos/
```

### Key backend directories

| Path | Role |
|------|------|
| `services/testDiscovery/` | Analyzer: intent, graph, composer, visual evidence, dynamic loading, no-results |
| `services/testCollections/collectionAnalyzerSettings.js` | Per-collection analyzer prefs + run comparison |
| `services/analyzer/` | Job wrapper + depth presets |
| `services/pageInspector/` | Load page, usability, challenge detection |
| `services/scenarios/` | Flow runner, reliability, selector fallback |
| `services/monitoring/` | Projects, scheduler, flow runs |

### Key frontend directories

| Path | Role |
|------|------|
| `pages/scenario-smart-flow/` | Analyzer home — site map, visual evidence, no-results |
| `pages/collection-detail/` | Batch actions, filters, settings, monitoring modal, history |
| `services/analyzer.service.ts` | Analyzer job API |
| `services/collection.service.ts` | Collection + batch + settings + comparison API |

---

## 12. Database schema (SQLite)

**File:** `backend/data/qa-agent.db`

| Table | Purpose |
|-------|---------|
| `scenarios` | Saved tests (+ collection_id, test_signature, metadata_json) |
| `test_collections` | Domain suites (+ metadata_json for analyzerSettings, analyzerHistory, testTags, monitoredScenarioIds) |
| `discovery_jobs` | Async job state + full result JSON (siteMap, noResults, etc.) |
| `projects`, `flows`, `flow_runs` | Monitoring |
| `scans`, ... | Site scans |

---

## 13. Frontend routes (complete)

| Route | Page |
|-------|------|
| `/` | Website Test Analyzer (site map + visual evidence) |
| `/collections/:id` | Collection detail (batch actions, history, settings) |
| `/projects/:id` | Monitoring dashboard (post monitor-from-collection) |
| ... | (see v0.8 brief for full list) |

---

## 14. Deployment

```bash
npm run docker          # → http://localhost:8080, http://localhost:3100
npm run dev:backend     # :3000
npm run dev:frontend    # :4200
cd backend && npx playwright install chromium
```

---

## 15. Hardcoding policy

Product discovery logic must **not** reference specific demo sites. Allowed only in tests, docs, and `backend/scripts/validate-analyzer.js`.

---

## 16. Validation status (v0.9)

Run: `cd backend && node scripts/validate-analyzer.js` (requires running backend on `:3100` Docker or `:3000` local; set `BACKEND_PORT` if needed)

Script validates against public demo pages (not in product logic):

| Page type | Expected |
|-----------|----------|
| Hover page | hover-reveal |
| Add/remove elements | dynamic-element-created-and-removable |
| Checkboxes | checkbox-toggle |
| Dropdown | dropdown-selection |
| Dynamic loading | dynamic-loading (improved probe in v0.9) |
| Login | login-error |
| example.com | runs generically |

Also checks: `siteMap` present, page intent detected, composed flow count logged.

---

## 17. Known limitations (v0.9)

1. **Long analyzer jobs** — still polling-based progress; no WebSocket/SSE
2. **Run-all / run-selected** — sequential server-side execution; large suites take time
3. **Login tests** — require confirmation; dummy credentials only
4. **Alert email** — stored in metadata; no email delivery yet
5. **Visual changed region** — approximate bounding box from diff elements; not pixel-perfect diff
6. **SPA-heavy sites** — some interactions still missed on very dynamic apps
7. **No auth/multi-tenant** — single-user local product
8. **Bundle size** — Angular main bundle ~725KB (budget warning)

---

## 18. Not implemented / gaps (opportunity areas for v1.0+)

### Analyzer
- [ ] WebSocket/SSE real-time progress
- [ ] Resume jobs after server restart
- [ ] User-defined safe credentials profile for login tests
- [ ] Export suggestions as Playwright spec / Cypress
- [ ] iframe / shadow DOM probing
- [ ] Side-by-side pixel diff (not just region highlight)

### Collections
- [ ] Drag-and-drop reorder tests
- [ ] Collection-level pass rate dashboard
- [ ] Replace vs merge UI when re-analyzing

### Infrastructure
- [ ] PostgreSQL, Redis job queue, auth, CI/CD integration, Slack alerts

---

## 19. API quick reference (v0.9 additions)

### Test collections (new in v0.9)
- `POST /api/test-collections/:id/run-selected` — `{ scenarioIds: number[] }`
- `DELETE /api/test-collections/:id/tests/batch` — `{ scenarioIds: number[] }`
- `POST /api/test-collections/:id/monitor-selected` — `{ scenarioIds, schedule, alertEmail? }`
- `POST /api/test-collections/:id/tag-tests` — `{ scenarioIds, tag }`
- `GET/PATCH /api/test-collections/:id/analyzer-settings`
- `GET /api/test-collections/:id/analyzer-comparison`

(See v0.8 sections for scans, scenarios, analyzer jobs, monitoring — unchanged base paths.)

---

## 20. Example prompts for AI (v0.9+ starters)

1. *"Propose v1.0 features building on page intent and composed flows — include effort S/M/L."*
2. *"Design email/Slack alerting using the existing monitorAlertEmail field."*
3. *"How would you add parallel test execution for collection run-selected without nginx timeouts?"*
4. *"Suggest improvements to flowComposer for checkout journeys without hardcoding URLs."*
5. *"Design a CI GitHub Action that runs a collection and posts analyzer comparison to a PR comment."*

---

## 21. Project file map

```
MVP/
├── AI_PRODUCT_BRIEF.md             # This file — best for AI handoff (v0.9)
├── DOCUMENTATION.md                # Detailed reference (update header to v0.9)
├── backend/
│   ├── scripts/validate-analyzer.js
│   └── src/services/testDiscovery/
│       ├── pageIntentClassifier.js
│       ├── actionGraphBuilder.js
│       ├── flowComposer.js
│       ├── visualEvidence.js
│       ├── dynamicLoadingProbe.js
│       ├── noResultsDebugger.js
│       └── discoveryService.js
│   └── src/services/testCollections/
│       └── collectionAnalyzerSettings.js
└── frontend/src/app/pages/
    ├── scenario-smart-flow/        # Site map + visual evidence UI
    └── collection-detail/          # Batch actions + history + settings
```

---

*Last updated: v0.9.0 — Page intent site map, multi-step flow composer, visual evidence, collection batch/monitor/compare.*
