#!/usr/bin/env node
/**
 * a11y-gate.js -- refuse to release the Toolbox while a screen misses WCAG 2.1 AA.
 *
 * Runs the toolkit's a11y-check.js (verify-view skill) over every URL listed
 * in a11y.json, against the app's OWN dev server + backend (this repo has no
 * local production build -- see CLAUDE.md "Release process" -- so the gate
 * checks the same code the dev server is serving, which must be current).
 *
 * Before running: start both servers in separate terminals --
 *   cd backend && source .venv/bin/activate && python run_backend.py
 *   cd frontend && npm run dev
 *
 * a11y.json:
 *   {
 *     "web": ["http://localhost:3000/?tab=...", ...],
 *     "exceptions": [{"rule": "...", "match": "...", "reason": "..."}]
 *   }
 *
 * a11y-check.js applies "exceptions" itself for axe/keyboard/focus findings.
 * Its reflow check has no exception hook (it is unconditional), so this
 * wrapper re-applies the same "exceptions" list to reflow findings too --
 * needed for the Electron-desktop reflow exception below.
 *
 * Usage: node scripts/a11y-gate.js [--skip-a11y-check]
 * Exit: 0 pass (or skipped), 1 fail, 2 usage/environment error.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'a11y.json');
const TOOL = process.env.A11Y_CHECK ||
  '/Home-Claude/ignition-claude-toolkit/plugins/ignition/skills/verify-view/tool/a11y-check.js';

if (process.argv.includes('--skip-a11y-check')) {
  console.log('a11y-gate: skipped (--skip-a11y-check)');
  process.exit(0);
}

if (!fs.existsSync(CONFIG)) {
  console.error(`a11y-gate: ${CONFIG} not found`);
  process.exit(2);
}
if (!fs.existsSync(TOOL)) {
  console.error(`a11y-gate: a11y-check.js not found at ${TOOL} (set A11Y_CHECK)`);
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
if (!config.web || !config.web.length) {
  console.error('a11y-gate: a11y.json has no "web" URLs to check');
  process.exit(2);
}

function checkReachable(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => { res.resume(); resolve(true); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  const first = new URL(config.web[0]);
  const origin = `${first.protocol}//${first.host}/`;
  if (!(await checkReachable(origin))) {
    console.error(`a11y-gate: ${origin} is not reachable.`);
    console.error('Start the frontend dev server (and the backend, for real data) first:');
    console.error('  cd backend && source .venv/bin/activate && python run_backend.py');
    console.error('  cd frontend && npm run dev');
    process.exit(2);
  }

  const tmp = fs.mkdtempSync('/tmp/a11y-gate-');
  const exceptionsFile = path.join(tmp, 'exceptions.json');
  const jsonOut = path.join(tmp, 'out.json');
  fs.writeFileSync(exceptionsFile, JSON.stringify(config.exceptions || []));

  const args = ['--web', ...config.web, '--exceptions', exceptionsFile, '--json', jsonOut];
  console.log('a11y-gate: web ' + config.web.join(' '));
  try {
    // a11y-check.js exits 1 whenever ANY finding remains -- including a
    // reflow finding this wrapper is about to except itself -- so a
    // non-zero exit here is expected and not itself the verdict; the JSON
    // it wrote is read below and re-judged after the extra reflow filter.
    execFileSync('node', [TOOL, ...args], { stdio: 'inherit' });
  } catch (e) {
    if (!fs.existsSync(jsonOut)) {
      console.error('a11y-gate: a11y-check.js failed before writing output: ' + e.message);
      fs.rmSync(tmp, { recursive: true, force: true });
      process.exit(2);
    }
  }

  // a11y-check.js already excepted axe/keyboard/focus findings against
  // exceptions.json; its reflow check has no exception hook, so re-apply
  // the same rules to any reflow findings here.
  const report = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  const exceptions = config.exceptions || [];
  let remaining = 0;
  for (const r of report.results) {
    if (r.error) { remaining++; continue; }
    for (const f of r.findings) {
      const excepted = f.check === 'reflow' && exceptions.some((e) =>
        e.rule === f.rule && (!e.match || (f.detail || '').includes(e.match)));
      if (!excepted) remaining++;
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  if (remaining > 0) {
    console.error(`a11y-gate: FAIL - ${remaining} finding(s) left after exceptions -- fix them, or record a reasoned exception in a11y.json`);
    process.exit(1);
  }
  console.log('a11y-gate: pass');
})();
