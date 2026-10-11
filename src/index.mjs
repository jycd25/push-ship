// Programmatic API.
//
//   import { pushShip } from 'push-ship';
//   const result = pushShip({ cwd: '/path/to/project', dryRun: true });

import { loadConfig, loadManifest, normalizeConfig, findConfig, expandHome, CONFIG_NAME, MANIFEST_NAME, ON_STOP_MODES } from './config.mjs';
import { sync, saveManifest, compileIgnore, DEFAULT_SKIP } from './sync.mjs';

export { loadConfig, loadManifest, normalizeConfig, findConfig, expandHome, sync, saveManifest, compileIgnore, CONFIG_NAME, MANIFEST_NAME, ON_STOP_MODES, DEFAULT_SKIP };

/**
 * Load config + manifest, run the sync, and persist the manifest (unless dryRun).
 */
export function pushShip({ cwd = process.cwd(), configPath, filters = [], dryRun = false, onEvent } = {}) {
  const config = loadConfig({ cwd, configPath });
  const manifest = loadManifest(config.manifestPath);
  const result = sync({ targets: config.targets, manifest, filters, dryRun, onEvent });
  if (!dryRun) saveManifest(config.manifestPath, manifest);
  return { ...result, config, manifest };
}
