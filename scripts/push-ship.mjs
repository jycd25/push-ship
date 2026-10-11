#!/usr/bin/env node
// push-ship: sync changed files from configured source dirs to their dest dirs.
// Change detection: SHA-1 fingerprints stored in .push-ship-manifest.json next
// to push-ship.config.json.
//
// Usage:
//   push-ship                  # push every changed file (also mirrors deletions)
//   push-ship template         # push only files named "template" (extension/dir ignored)
//   push-ship --dry-run        # list what would be added/updated/removed, write nothing
//   push-ship --init           # write a starter push-ship.config.json in the cwd
//   push-ship --config <path>  # use a specific config file

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pushShip, CONFIG_NAME } from '../src/index.mjs';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('-')));
const nameFilters = [];
let configPath;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--config' || a === '-c') {
    configPath = argv[++i];
    if (!configPath) fail('--config requires a path');
  } else if (a.startsWith('--config=')) {
    configPath = a.slice('--config='.length);
  } else if (!a.startsWith('-')) {
    nameFilters.push(a);
  }
}
const dryRun = flags.has('--dry-run') || flags.has('-n');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const green = (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const tan = (s) => (useColor ? `\x1b[38;5;180m${s}\x1b[0m` : s);
const red = (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);

function fail(msg) {
  console.error(`push-ship: ${msg}`);
  process.exit(1);
}

if (flags.has('--help') || flags.has('-h')) {
  console.log(`push-ship — sync new and changed files from source dirs to target dirs

Usage:
  push-ship [names...] [--dry-run] [--config <path>]
  push-ship --init
  push-ship --help | --version

Arguments:
  names           Only push files whose basename matches (extension optional).
                  Filtered runs never mirror deletions.

Options:
  -n, --dry-run   Print what would be added/updated/removed; write nothing.
  -c, --config    Path to a config file (default: nearest ${CONFIG_NAME}).
      --init      Create a starter ${CONFIG_NAME} in the current directory.
  -h, --help      Show this help.
  -v, --version   Show the version.

Config (${CONFIG_NAME}, found by walking up from the cwd):
  { "onStop": "push",
    "ignore": ["*.log", "drafts/"],
    "targets": [ { "src": "dist", "dest": "../other-repo/dist", "ignore": ["*.map"] },
                 { "src": "README.md", "dest": "~/sites/docs" } ] }

  src     relative to the config file's directory (file or directory).
  dest    absolute, ~-prefixed, or relative to the config file's directory.
          A directory src maps its contents onto dest; a file src lands at dest/<basename>.
  ignore  gitignore-style globs relative to src (top-level and/or per target).
  rename  file sources only: filename to use at dest instead of the basename.
  onStop  push | report | off — what the Claude Code Stop hook does after each turn.
  The manifest .push-ship-manifest.json is written beside the config file.`);
  process.exit(0);
}

if (flags.has('--version') || flags.has('-v')) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

if (flags.has('--init')) {
  const target = path.resolve(process.cwd(), configPath || CONFIG_NAME);
  if (existsSync(target)) fail(`${target} already exists`);
  const starter = {
    onStop: 'push',
    ignore: ['*.log'],
    targets: [
      { src: 'dist', dest: '../target-repo/dist' },
      { src: 'README.md', dest: '../target-repo' },
    ],
  };
  writeFileSync(target, JSON.stringify(starter, null, 2) + '\n');
  console.log(`push-ship: wrote ${target} — edit the targets, then run \`push-ship --dry-run\``);
  process.exit(0);
}

let result;
try {
  result = pushShip({
    configPath,
    filters: nameFilters,
    dryRun,
    onEvent({ type, key, dest }) {
      if (type === 'added') console.log(`  ${green('added  ')} ${key} -> ${dest}`);
      else if (type === 'updated') console.log(`  ${tan('updated')} ${key} -> ${dest}`);
      else console.log(`  ${red('removed')} ${dest}`);
    },
  });
} catch (err) {
  fail(err.message);
}

for (const e of result.errors) console.error(`push-ship: ${e}`);
if (result.errors.length) process.exitCode = 1;

const label = dryRun ? 'push-ship (dry run)' : 'push-ship';
const pushed = result.added + result.updated;
if (nameFilters.length && pushed === 0 && result.matchedUnchanged === 0) {
  console.log(`${label}: no file matching "${nameFilters.join('", "')}" found in configured sources`);
} else if (pushed === 0 && result.deleted === 0) {
  console.log(`${label}: everything up to date`);
} else {
  console.log(
    `${label}: ${green(`${result.added} added`)}, ${tan(`${result.updated} updated`)}, ${result.deleted} removed${dryRun ? ' — nothing written' : ''}`,
  );
}

