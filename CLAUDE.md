# CLAUDE.md - Development Guide for Claude Code

Guidance for Claude Code working on the Ignition Toolbox — the distributable
Electron version of the Ignition Automation Toolkit.

**Read `PROJECT_GOALS.md` first** — problem statement, target users, "what this
is NOT", and the decision framework. Goals drive every feature decision.

**Architecture:** Electron + Python subprocess. **Target platform:** Windows,
macOS, Linux. **Key technologies:** Electron, TypeScript, React 19, FastAPI,
Playwright, SQLite. Current version: `package.json` (single source of truth).

Electron main process spawns the Python (FastAPI) backend as a subprocess and
talks IPC to the React renderer; the renderer talks HTTP/WebSocket to the
backend. Full design in `ARCHITECTURE.md`.

## Project Structure

```
ignition-toolbox/
├── electron/       # Main process (TypeScript): entry, IPC, backend/updater/settings services
├── backend/        # Python: ignition_toolkit/ package, playbooks/ library, run_backend.py entry
├── frontend/       # React: src/{pages,components,hooks,store,api}, dist/ built output
├── docs/           # Documentation
├── .claude/        # Claude Code configuration
├── package.json
└── electron-builder.yml
```

## Development Workflow

### Setup

```bash
cd "$(git rev-parse --show-toplevel)"   # repo root
npm install
cd frontend && npm install && cd ..
cd backend
python3 -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cd ..
```

Prerequisites: Node.js 22+, Python 3.13+, npm.

### Running in Development

```bash
npm run dev               # frontend + Electron together (requires display)
npm run dev:frontend      # Vite dev server (port 3000) only
npm run dev:electron      # Electron with Python backend only
cd backend && source .venv/bin/activate && python run_backend.py  # backend only, headless
```

### Release process

Production builds run on GitHub Actions, never locally — PyInstaller produces
platform-specific binaries, so a local build only works on the machine that
made it. `npm run dist:*` is for local development builds only.

1. Bump version in `package.json` and `frontend/package.json`, commit.
2. `git tag v<version> && git push origin v<version>`.
3. `build.yml` builds on 4 runners (`windows-latest`, `ubuntu-latest`,
   `macos-latest` x64/arm64), packages with PyInstaller + electron-builder,
   publishes a GitHub Release with all installers and auto-update manifests.

`ci.yml` runs build verification on every push to main and PR. Both workflows
can also be triggered manually from the Actions UI (workflow_dispatch).

## Key Components

### Electron Main Process (`electron/`)

| File | Purpose |
| ------ | --------- |
| `main.ts` | App entry, window creation, lifecycle |
| `preload.ts` | Context bridge exposing IPC to renderer |
| `services/python-backend.ts` | Spawns/monitors Python subprocess |
| `services/auto-updater.ts` | GitHub-based auto-updates |
| `services/settings.ts` | Persistent app settings |
| `ipc/handlers.ts` | IPC handler registration |

### Python Backend (`backend/`)

| Module | Purpose |
| -------- | --------- |
| `ignition_toolkit/api/` | FastAPI REST API and WebSocket |
| `ignition_toolkit/playbook/` | Playbook engine (37 step types — source of truth: `StepType` enum in `playbook/models.py`) |
| `ignition_toolkit/browser/` | Playwright browser automation |
| `ignition_toolkit/gateway/` | Ignition Gateway REST client |
| `ignition_toolkit/credentials/` | Fernet-encrypted credential vault |
| `ignition_toolkit/storage/` | SQLite database |
| `ignition_toolkit/stackbuilder/` | Docker Compose generator (25+ services) |
| `ignition_toolkit/auth/` | API key authentication + RBAC |
| `ignition_toolkit/execution/` | Parallel execution queue |
| `ignition_toolkit/reporting/` | Analytics and report exports |
| `ignition_toolkit/mcp_server.py` | MCP server (20 tools, 2 resources) |
| `ignition_toolkit/startup/` | Startup validation and Playwright installer |
| `ignition_toolkit/scheduler/` | Playbook scheduling |
| `ignition_toolkit/update/` | Version update checking |
| `ignition_toolkit/modules/` | Ignition module management |

### Frontend (`frontend/`)

React 19 + TypeScript + Material-UI v7.

| Directory | Purpose |
| ----------- | --------- |
| `src/pages/` | 9 pages: Playbooks, Executions, ExecutionDetail, Credentials, StackBuilder, UdtBuilder, APIExplorer, Audit, Settings |
| `src/components/` | Reusable UI components |
| `src/components/api-explorer/` | API Explorer sub-components (ResponseViewer, JsonViewer, TableView, EndpointDocPanel, DocumentationCard) |
| `src/data/` | Static data (ignitionApiDocs.ts) |
| `src/hooks/` | WebSocket hook, playbook order hook |
| `src/store/` | Zustand global state |
| `src/api/` | HTTP API client |

StackBuilder is a *feature* that manages Docker containers for Ignition
infrastructure — the Toolbox itself is a desktop app, not deployed via Docker.

## Core Principles

1. **Domain Separation** - Playbooks are Gateway-only OR Perspective-only
2. **Visual Feedback** - Users see what's happening via live browser streaming
3. **Playbook Library** - Users duplicate and modify existing playbooks
4. **Secure by Default** - Credentials encrypted, never in playbooks

## Security

- **Credentials**: Fernet encryption, stored in user data directory
- **IPC**: Context isolation, validated channels
- **Updates**: Signed releases from GitHub

## Important Files

| File | Purpose |
| ------ | --------- |
| `package.json` | Electron config, scripts, dependencies |
| `electron-builder.yml` | Distribution configuration |
| `backend/requirements.txt` | Python dependencies |
| `frontend/vite.config.ts` | Vite build configuration |
| `PROJECT_GOALS.md` | Project goals and decision framework |
| `ARCHITECTURE.md` | Architecture decision records |
| `resources/icon.png` | App icon used by `electron-builder.yml` |

## Skills (load before the matching task)

| Task                                                                       | Skill                       |
|----------------------------------------------------------------------------|-----------------------------|
| Writing/reviewing Python or TS code, commits, releases                     | `toolbox-conventions`       |
| Anything touching credentials, auth, inputs, subprocess, or file handling  | `security-checking`         |
| Running tests/lint, verifying a change, running the app                    | `testing-and-verification`  |
| Adding/changing a playbook step type (StepType, registry, executors)       | `add-step-type`             |
| Adding/changing an API endpoint or wiring backend → frontend               | `add-api-endpoint`          |
| Editing library playbooks (`backend/playbooks/`) or `playbooks-index.json` | `playbook-authoring`        |

Skills live in `.claude/skills/`. Load them — don't work from memory.

**Work queue:** `docs/OPEN_WORK.md` is the live list of unfinished work. The
Electron app is being progressively replaced by native Ignition projects
(`../toolbox-projects/MIGRATION.md`, D11), so scope any new Electron-side
feature work with eventual porting/retirement in mind.
