#!/usr/bin/env node
// Stop hook: after Claude finishes a turn, push changed files for the project
// in the session's cwd — but only if that project has a push-ship.config.json
// and its "onStop" is not "off". Never blocks; reports via systemMessage.
import { findConfig, loadConfig, loadManifest, sync, saveManifest } from '../src/index.mjs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let cwd = process.cwd();
  try { cwd = JSON.parse(input).cwd || cwd; } catch { /* no JSON on stdin: fall back to cwd */ }

  if (!findConfig(cwd)) process.exit(0);

  let config;
  try { config = loadConfig({ cwd }); } catch (err) {
    out(`push-ship: ${err.message}`);
    process.exit(0);
  }
  if (config.onStop === 'off') process.exit(0);

  const dryRun = config.onStop === 'report';
  const manifest = loadManifest(config.manifestPath);
  const result = sync({ targets: config.targets, manifest, dryRun });
  if (!dryRun) saveManifest(config.manifestPath, manifest);

  const pushed = result.added + result.updated + result.deleted;
  if (pushed === 0 && result.errors.length === 0) process.exit(0);

  const lines = result.actions.map((a) => `  ${a.type.padEnd(7)} ${a.type === 'removed' ? a.dest : `${a.key} -> ${a.dest}`}`);
  for (const e of result.errors) lines.push(`  error   ${e}`);
  const verb = dryRun ? 'pending (onStop: report)' : 'pushed';
  lines.unshift(`push-ship ${verb}: ${result.added} added, ${result.updated} updated, ${result.deleted} removed`);
  out(lines.join('\n'));
  process.exit(0);
});

function out(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }) + '\n');
}
