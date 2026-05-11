// Spawn Electron in dev mode with a clean environment.
//
// Why this exists: Claude Code (and other Electron-host environments) set
// ELECTRON_RUN_AS_NODE=1 in subprocesses to prevent nested GUIs. That env var
// turns Electron into a plain Node.js — `require('electron')` returns a path
// string instead of the API object, breaking the main process at `app.whenReady()`.
// This launcher inherits the parent env, strips that variable, then spawns
// electron from node_modules.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBin = require('electron');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const env = { ...process.env, NODE_ENV: 'development' };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.'], {
  cwd: projectRoot,
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error('electron exited with signal', signal);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.killed || child.kill(sig));
}
