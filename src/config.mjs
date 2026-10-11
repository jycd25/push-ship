// Locate and load push-ship.config.json.
//
// Resolution order:
//   1. an explicit path (--config)
//   2. push-ship.config.json in the current directory or any ancestor
//
// The directory holding the config file is the project root: `src` entries
// resolve against it, and the manifest (.push-ship-manifest.json) lives there.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const CONFIG_NAME = 'push-ship.config.json';
export const MANIFEST_NAME = '.push-ship-manifest.json';
export const ON_STOP_MODES = ['push', 'report', 'off'];

function asStringArray(v, label) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new Error(`${CONFIG_NAME}: "${label}" must be an array of strings`);
  }
  return v;
}

export function findConfig(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2));
  return p;
}

/**
 * Parse and validate a config object. Returns normalized targets with
 * `src` resolved against `root` and `dest` resolved against `root` as well
 * (absolute dests and `~/` dests are honoured). Top-level `ignore` patterns
 * are merged into every target's own `ignore` list.
 */
export function normalizeConfig(raw, root) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.targets)) {
    throw new Error(`${CONFIG_NAME}: expected { "targets": [ { "src", "dest" }, ... ] }`);
  }
  const globalIgnore = asStringArray(raw.ignore, 'ignore');
  const targets = raw.targets.map((t, i) => {
    if (!t || typeof t.src !== 'string' || typeof t.dest !== 'string') {
      throw new Error(`${CONFIG_NAME}: targets[${i}] must have string "src" and "dest"`);
    }
    if (t.rename !== undefined && (typeof t.rename !== 'string' || !t.rename || t.rename.includes('/'))) {
      throw new Error(`${CONFIG_NAME}: targets[${i}].rename must be a plain filename`);
    }
    return {
      src: t.src.replace(/\/+$/, '') || '.',
      srcPath: path.resolve(root, t.src),
      dest: path.resolve(root, expandHome(t.dest)),
      ignore: [...globalIgnore, ...asStringArray(t.ignore, `targets[${i}].ignore`)],
      rename: t.rename,
    };
  });
  const onStop = raw.onStop ?? 'push';
  if (!ON_STOP_MODES.includes(onStop)) {
    throw new Error(`${CONFIG_NAME}: "onStop" must be one of ${ON_STOP_MODES.join(', ')}`);
  }
  return { root, targets, onStop, manifestPath: path.join(root, MANIFEST_NAME) };
}

export function loadConfig({ configPath, cwd = process.cwd() } = {}) {
  const file = configPath ? path.resolve(cwd, configPath) : findConfig(cwd);
  if (!file) {
    throw new Error(
      `no ${CONFIG_NAME} found in ${cwd} or any parent directory (run \`push-ship --init\` to create one)`,
    );
  }
  if (!existsSync(file)) throw new Error(`config file not found: ${file}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
  return { ...normalizeConfig(raw, path.dirname(file)), configPath: file };
}

export function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    // A corrupt manifest just means a full re-push; copies are idempotent.
    return {};
  }
}
