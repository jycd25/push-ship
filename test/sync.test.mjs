import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sync } from '../src/sync.mjs';
import { normalizeConfig } from '../src/config.mjs';

let root, dest;
const write = (rel, content) => {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, content);
};
const run = (manifest, opts = {}) => {
  const { targets } = normalizeConfig(
    { targets: [{ src: 'lib', dest }, { src: 'README.md', dest }] },
    root,
  );
  return sync({ targets, manifest, ...opts });
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'push-ship-src-'));
  dest = mkdtempSync(path.join(tmpdir(), 'push-ship-dest-'));
  write('lib/a.js', 'a1');
  write('lib/nested/b.js', 'b1');
  write('README.md', 'readme');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(dest, { recursive: true, force: true });
});

test('first run adds every file and fills the manifest', () => {
  const manifest = {};
  const r = run(manifest);
  assert.equal(r.added, 3);
  assert.equal(r.updated, 0);
  assert.equal(r.deleted, 0);
  assert.deepEqual(r.errors, []);
  assert.equal(readFileSync(path.join(dest, 'a.js'), 'utf8'), 'a1');
  assert.equal(readFileSync(path.join(dest, 'nested/b.js'), 'utf8'), 'b1');
  assert.equal(readFileSync(path.join(dest, 'README.md'), 'utf8'), 'readme');
  assert.deepEqual(Object.keys(manifest).sort(), ['README.md', 'lib/a.js', 'lib/nested/b.js']);
});

test('second run with no changes is a no-op', () => {
  const manifest = {};
  run(manifest);
  const r = run(manifest);
  assert.equal(r.added + r.updated + r.deleted, 0);
});

test('changed content is reported as updated and copied', () => {
  const manifest = {};
  run(manifest);
  write('lib/a.js', 'a2');
  const r = run(manifest);
  assert.equal(r.updated, 1);
  assert.equal(r.added, 0);
  assert.equal(readFileSync(path.join(dest, 'a.js'), 'utf8'), 'a2');
  assert.equal(r.actions[0].type, 'updated');
  assert.equal(r.actions[0].key, 'lib/a.js');
});

test('a file missing at dest is re-pushed even if the manifest matches', () => {
  const manifest = {};
  run(manifest);
  rmSync(path.join(dest, 'a.js'));
  const r = run(manifest);
  assert.equal(r.added, 1);
  assert.ok(existsSync(path.join(dest, 'a.js')));
});

test('full runs mirror deletions for directory sources', () => {
  const manifest = {};
  run(manifest);
  rmSync(path.join(root, 'lib/nested/b.js'));
  const r = run(manifest);
  assert.equal(r.deleted, 1);
  assert.ok(!existsSync(path.join(dest, 'nested/b.js')));
  assert.ok(!('lib/nested/b.js' in manifest));
});

test('name filter pushes only matching basenames, ignores extension, never deletes', () => {
  const manifest = {};
  run(manifest);
  write('lib/a.js', 'a3');
  write('lib/nested/b.js', 'b3');
  rmSync(path.join(root, 'README.md'));
  // README is a file source that vanished -> error, but lib still syncs.
  const r = run(manifest, { filters: ['a'] });
  assert.equal(r.updated, 1);
  assert.equal(r.deleted, 0);
  assert.equal(readFileSync(path.join(dest, 'a.js'), 'utf8'), 'a3');
  assert.equal(readFileSync(path.join(dest, 'nested/b.js'), 'utf8'), 'b1', 'unfiltered file left alone');
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /source not found/);
});

test('filter with a matching but unchanged file reports matchedUnchanged', () => {
  const manifest = {};
  run(manifest);
  const r = run(manifest, { filters: ['a.js'] });
  assert.equal(r.matchedUnchanged, 1);
  assert.equal(r.added + r.updated, 0);
});

test('dry run reports actions but writes nothing', () => {
  const manifest = {};
  const r = run(manifest, { dryRun: true });
  assert.equal(r.added, 3);
  assert.ok(!existsSync(path.join(dest, 'a.js')));
  assert.deepEqual(manifest, {});
});

test('missing dest dir is an error and skips that target', () => {
  const manifest = {};
  const { targets } = normalizeConfig(
    { targets: [{ src: 'lib', dest: path.join(dest, 'nope') }] },
    root,
  );
  const r = sync({ targets, manifest });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /dest dir not found/);
  assert.equal(r.added, 0);
});

test('skipped names (node_modules, .git, .DS_Store) are never walked', () => {
  write('lib/node_modules/x.js', 'x');
  write('lib/.git/HEAD', 'ref');
  write('lib/.DS_Store', '');
  const manifest = {};
  const r = run(manifest);
  assert.equal(r.added, 3);
  assert.ok(!existsSync(path.join(dest, 'node_modules')));
});

test('rename ships a file source under a different name; errors for directory sources', () => {
  write('docs/public-README.md', 'pub');
  const { targets } = normalizeConfig(
    { targets: [
      { src: 'docs/public-README.md', dest, rename: 'README.md' },
      { src: 'lib', dest, rename: 'nope' },
    ] },
    root,
  );
  const manifest = {};
  const r = sync({ targets, manifest });
  assert.equal(readFileSync(path.join(dest, 'README.md'), 'utf8'), 'pub');
  assert.ok(!existsSync(path.join(dest, 'public-README.md')));
  assert.equal(manifest['docs/public-README.md'].length, 40);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /rename.*file sources/);
  // unchanged on second run
  assert.equal(sync({ targets: [targets[0]], manifest }).updated, 0);
});
