import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Detects the user's installed OpenCode CLI on Windows.
//
// Strategy (in order):
//  1. `where.exe opencode` — resolves via the current process PATH.
//  2. Well-known install locations (covers packaged Electron builds whose
//     PATH may not include the user's npm/shim directories).
//
// Never bundles or installs OpenCode; only observes what the user has.
const KNOWN_CANDIDATES = () => {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [
    path.join(appData, 'npm', 'opencode.cmd'),
    path.join(appData, 'npm', 'opencode.exe'),
    path.join(home, '.opencode', 'bin', 'opencode.cmd'),
    path.join(home, '.opencode', 'bin', 'opencode.exe'),
    path.join(localAppData, 'Programs', 'opencode', 'opencode.exe'),
  ];
};

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function runVersion(exe) {
  // .cmd shims need cmd.exe on Windows; exes run directly.
  const isCmd = /\.cmd$/i.test(exe);
  const file = isCmd ? 'cmd.exe' : exe;
  const args = isCmd ? ['/c', exe, '--version'] : ['--version'];
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: String(err?.message ?? err) });
      const raw = String(stdout || '').trim().split(/\s+/).pop() || null;
      resolve({ ok: true, version: raw ? raw.replace(/^v/i, '') : null });
    });
  });
}

function whereCli() {
  return new Promise((resolve) => {
    execFile('where.exe', ['opencode'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve([]);
      return resolve(
        String(stdout || '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    });
  });
}

let cache = null;

export function configDir() {
  return path.join(os.homedir(), '.config', 'opencode');
}

// Build a spawnable `opencode serve --service` command for Service.ensure.
// npm .cmd shims can't be spawned directly, so resolve the real exe next
// to the shim (npm layout) and fall back to PATH resolution.
export function serviceCommand(cliPath) {
  const base = ['serve', '--service'];
  if (!cliPath) return ['opencode', ...base];
  if (/\.exe$/i.test(cliPath)) return [cliPath, ...base];
  if (/\.cmd$/i.test(cliPath)) {
    const real = path.join(
      path.dirname(cliPath),
      'node_modules', '@opencode', 'cli', 'bin', 'opencode.exe',
    );
    if (exists(real)) return [real, ...base];
  }
  return ['opencode', ...base];
}

export async function detectCli({ refresh = false } = {}) {
  if (cache && !refresh) return cache;
  const seen = new Set();
  const candidates = [...(await whereCli()), ...KNOWN_CANDIDATES()].filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return exists(p);
  });
  let result = { found: false, path: null, version: null, configDir: configDir(), configPresent: exists(configDir()) };
  for (const exe of candidates) {
    const v = await runVersion(exe);
    if (v.ok) {
      result = { found: true, path: exe, version: v.version, configDir: configDir(), configPresent: exists(configDir()) };
      break;
    }
  }
  if (!result.found) {
    result.tried = candidates;
  }
  cache = result;
  return result;
}
