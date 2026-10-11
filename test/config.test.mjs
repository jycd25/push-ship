import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { findConfig, loadConfig, normalizeConfig, expandHome, CONFIG_NAME } from '../src/config.mjs';

test('findConfig walks up from a nested cwd', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'push-ship-cfg-'));
  try {
    writeFileSync(path.join(root, CONFIG_NAME), '{"targets":[]}');
    const deep = path.join(root, 'a/b/c');
    mkdirSync(deep, { recursive: true });
    assert.equal(findConfig(deep), path.join(root, CONFIG_NAME));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadConfig resolves src against the config dir and dest relative/absolute/home', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'push-ship-cfg-'));
  try {
    writeFileSync(
      path.join(root, CONFIG_NAME),
      JSON.stringify({
        targets: [
          { src: 'dist/', dest: '../sibling/dist' },
          { src: 'x.md', dest: '/abs/dir' },
          { src: 'y.md', dest: '~/docs' },
        ],
      }),
    );
    const cfg = loadConfig({ cwd: root });
    assert.equal(cfg.root, root);
    assert.equal(cfg.manifestPath, path.join(root, '.push-ship-manifest.json'));
    assert.equal(cfg.targets[0].src, 'dist');
    assert.equal(cfg.targets[0].srcPath, path.join(root, 'dist'));
    assert.equal(cfg.targets[0].dest, path.resolve(root, '../sibling/dist'));
    assert.equal(cfg.targets[1].dest, path.resolve('/abs/dir'));
    assert.equal(cfg.targets[2].dest, path.join(homedir(), 'docs'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loadConfig errors clearly when no config exists', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'push-ship-nocfg-'));
  try {
    // Walk-up may hit a real config above tmpdir only if one exists there; guard with explicit path.
    assert.throws(() => loadConfig({ cwd: root, configPath: 'missing.json' }), /config file not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('normalizeConfig validates shape', () => {
  assert.throws(() => normalizeConfig({}, '/r'), /expected \{ "targets"/);
  assert.throws(() => normalizeConfig({ targets: [{ src: 'a' }] }, '/r'), /targets\[0\]/);
});

test('expandHome', () => {
  assert.equal(expandHome('~'), homedir());
  assert.equal(expandHome('~/x'), path.join(homedir(), 'x'));
  assert.equal(expandHome('/x'), '/x');
  assert.equal(expandHome('rel'), 'rel');
});

test('rename is accepted for files and rejected when not a plain filename', () => {
  const t = normalizeConfig({ targets: [{ src: 'docs/pub.md', dest: '/d', rename: 'README.md' }] }, '/r').targets[0];
  assert.equal(t.rename, 'README.md');
  assert.throws(() => normalizeConfig({ targets: [{ src: 'a', dest: '/d', rename: 'x/y' }] }, '/r'), /rename/);
  assert.throws(() => normalizeConfig({ targets: [{ src: 'a', dest: '/d', rename: '' }] }, '/r'), /rename/);
});
