import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sync, compileIgnore } from '../src/sync.mjs';
import { normalizeConfig } from '../src/config.mjs';

test('compileIgnore semantics', () => {
  const ig = compileIgnore(['*.log', 'build/', 'docs/draft*', '**/*.tmp', 'secret']);
  assert.ok(ig('a.log', false));
  assert.ok(ig('x/y/b.log', false));
  assert.ok(ig('build', true));
  assert.ok(!ig('build', false), 'trailing slash means dirs only');
  assert.ok(ig('docs/draft1.md', false));
  assert.ok(!ig('x/docs/draft1.md', false), 'pattern with / is anchored');
  assert.ok(ig('a/b/c.tmp', false));
  assert.ok(ig('c.tmp', false));
  assert.ok(ig('x/secret', true));
  assert.ok(!ig('secrets', false));
});

test('global and per-target ignore patterns are honoured; push-ship files always skipped', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'push-ship-ig-'));
  const dest = mkdtempSync(path.join(tmpdir(), 'push-ship-igd-'));
  try {
    const w = (rel, c = 'x') => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), c); };
    w('keep.md'); w('debug.log'); w('drafts/a.md'); w('img/pic.png'); w('img/pic.psd'); w('deep/x/y.tmp');
    w('push-ship.config.json', '{}'); w('.push-ship-manifest.json', '{}');
    const { targets } = normalizeConfig(
      { ignore: ['*.log', 'drafts/', '**/*.tmp'], targets: [{ src: '.', dest, ignore: ['*.psd'] }] },
      root,
    );
    const r = sync({ targets, manifest: {} });
    assert.deepEqual(r.errors, []);
    assert.ok(existsSync(path.join(dest, 'keep.md')));
    assert.ok(existsSync(path.join(dest, 'img/pic.png')));
    for (const skipped of ['debug.log', 'drafts/a.md', 'img/pic.psd', 'deep/x/y.tmp', 'push-ship.config.json', '.push-ship-manifest.json']) {
      assert.ok(!existsSync(path.join(dest, skipped)), `${skipped} should be ignored`);
    }
    assert.equal(r.added, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(dest, { recursive: true, force: true });
  }
});

test('onStop is validated and defaults to push', () => {
  assert.equal(normalizeConfig({ targets: [] }, '/r').onStop, 'push');
  assert.equal(normalizeConfig({ targets: [], onStop: 'report' }, '/r').onStop, 'report');
  assert.throws(() => normalizeConfig({ targets: [], onStop: 'yes' }, '/r'), /onStop/);
});
