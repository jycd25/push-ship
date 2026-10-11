// Core sync: compare SHA-1 fingerprints against the manifest and copy
// added/updated files from each target's src to its dest. Full runs also
// mirror deletions for directory sources.

import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';

// Always ignored, in every target: VCS/dependency dirs and push-ship's own files.
export const DEFAULT_SKIP = ['.git', 'node_modules', '.DS_Store', 'push-ship.config.json', '.push-ship-manifest.json'];

const stem = (name) => name.replace(/\.[^.]+$/, '');
const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

/**
 * Compile ignore patterns into a predicate over (relPath, isDir).
 * Patterns are gitignore-flavoured globs matched against the path relative
 * to the target's src (always with `/` separators):
 *   name        -> matches a file or dir named `name` at any depth
 *   *.log       -> `*` matches within one path segment
 *   build/      -> trailing slash: directories only
 *   docs/draft* -> contains `/`: anchored to the src root
 *   **\/*.tmp    -> `**` spans segments
 */
export function compileIgnore(patterns) {
  const rules = patterns.map((raw) => {
    let p = raw.trim();
    if (!p || p.startsWith('#')) return null;
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1);
    const anchored = p.includes('/');
    p = p.replace(/^\.\//, '').replace(/^\//, '');
    let re = '';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '*') {
        if (p[i + 1] === '*') {
          i++;
          if (p[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
        } else re += '[^/]*';
      } else if (c === '?') re += '[^/]';
      else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    const regex = anchored ? new RegExp(`^${re}$`) : new RegExp(`(^|/)${re}$`);
    return { regex, dirOnly };
  }).filter(Boolean);
  return (rel, isDir) => rules.some((r) => (!r.dirOnly || isDir) && r.regex.test(rel));
}

export function walk(dir, ignored, out = [], base = dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const isDir = statSync(full).isDirectory();
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (ignored(rel, isDir)) continue;
    if (isDir) walk(full, ignored, out, base);
    else out.push(full);
  }
  return out;
}

export function makeFilter(nameFilters) {
  if (!nameFilters || nameFilters.length === 0) return () => true;
  return (file) => {
    const base = path.basename(file);
    return nameFilters.some((f) => base === f || stem(base) === stem(f));
  };
}

/**
 * Run the sync.
 *
 * @param {object} opts
 * @param {Array<{src:string, srcPath:string, dest:string, ignore?:string[], rename?:string}>} opts.targets normalized targets
 * @param {Record<string,string>} opts.manifest key -> sha1 (mutated in place unless dryRun)
 * @param {string[]} [opts.filters] basenames (extension optional) to restrict the push to
 * @param {boolean} [opts.dryRun]
 * @param {string[]} [opts.skip] patterns ignored in every target (default: DEFAULT_SKIP)
 * @param {(event: object) => void} [opts.onEvent] receives {type, key, dest} per action
 * @returns {{added:number, updated:number, deleted:number, matchedUnchanged:number, errors:string[], actions:object[]}}
 */
export function sync({ targets, manifest, filters = [], dryRun = false, skip = DEFAULT_SKIP, onEvent }) {
  const matches = makeFilter(filters);
  const filtered = filters.length > 0;
  const result = { added: 0, updated: 0, deleted: 0, matchedUnchanged: 0, errors: [], actions: [] };
  const emit = (ev) => {
    result.actions.push(ev);
    if (onEvent) onEvent(ev);
  };

  for (const { src, srcPath, dest, ignore = [], rename } of targets) {
    if (!existsSync(srcPath)) {
      result.errors.push(`source not found: ${srcPath}`);
      continue;
    }
    if (!existsSync(dest)) {
      result.errors.push(`dest dir not found: ${dest} (create it first)`);
      continue;
    }

    const isDir = statSync(srcPath).isDirectory();
    if (isDir && rename) {
      result.errors.push(`"rename" only applies to file sources: ${src}`);
      continue;
    }
    const ignored = compileIgnore([...skip, ...ignore]);
    const files = isDir ? walk(srcPath, ignored) : [srcPath];
    const onDisk = new Set();

    for (const file of files) {
      const rel = isDir ? path.relative(srcPath, file) : (rename || path.basename(file));
      const key = isDir ? `${src}/${rel.split(path.sep).join('/')}` : src;
      onDisk.add(key);
      if (!matches(file)) continue;

      const hash = sha1(file);
      const destFile = path.join(dest, rel);
      if (manifest[key] === hash && existsSync(destFile)) {
        if (filtered) result.matchedUnchanged++;
        continue;
      }
      const isNew = !existsSync(destFile);
      if (!dryRun) {
        mkdirSync(path.dirname(destFile), { recursive: true });
        copyFileSync(file, destFile);
        manifest[key] = hash;
      }
      if (isNew) result.added++;
      else result.updated++;
      emit({ type: isNew ? 'added' : 'updated', key, dest: destFile });
    }

    // Mirror deletions only on full runs; a name filter shouldn't cause removals.
    // File sources need none: a vanished file is reported as "source not found".
    if (!filtered && isDir) {
      for (const key of Object.keys(manifest)) {
        if (!key.startsWith(`${src}/`) || onDisk.has(key)) continue;
        const destFile = path.join(dest, key.slice(src.length + 1));
        if (!dryRun) {
          if (existsSync(destFile)) rmSync(destFile);
          delete manifest[key];
        }
        result.deleted++;
        emit({ type: 'removed', key, dest: destFile });
      }
    }
  }

  return result;
}

export function saveManifest(manifestPath, manifest) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
