#!/usr/bin/env node
// SessionStart hook: if the project has a push-ship.config.json, tell Claude so
// it knows the sync exists, where files go, and that it runs on Stop.
import { findConfig, loadConfig } from '../src/index.mjs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let cwd = process.cwd();
  try { cwd = JSON.parse(input).cwd || cwd; } catch { /* ignore */ }
  if (!findConfig(cwd)) process.exit(0);
  try {
    const cfg = loadConfig({ cwd });
    const lines = cfg.targets.map((t) => `  ${t.src} -> ${t.dest}`);
    const auto = cfg.onStop === 'push'
      ? 'Changed files are pushed automatically when you finish each turn.'
      : cfg.onStop === 'report'
        ? 'Pending changes are reported (not pushed) when you finish each turn; run /push-ship to push.'
        : 'Automatic push on stop is off; run /push-ship to push.';
    process.stdout.write(
      `push-ship is configured for this project (${cfg.configPath}):\n${lines.join('\n')}\n${auto} ` +
      'Use /push-ship [names] [--dry-run] to push on demand. Edit push-ship.config.json to change targets or ignore patterns.\n',
    );
  } catch (err) {
    process.stdout.write(`push-ship: config error — ${err.message}\n`);
  }
  process.exit(0);
});
