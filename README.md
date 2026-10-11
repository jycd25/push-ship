# push-ship

**Build in one repo. Ship from another. Nothing leaks.**

push-ship is a Claude Code plugin (and plain CLI) for the workflow where the
repo you *work in* is not the repo you *publish*. Your working repo holds
everything: design docs, AI skills and prompts, scratch experiments, half-done
refactors, giant test fixtures. The shipped repo should hold only the product.
push-ship copies exactly the files you list, only when their content changes,
from the working repo to the shipped one — automatically, after every Claude
Code turn.

Typical things that stay behind:

- design docs, specs, plans, meeting notes
- `.claude/`, skills, agents, prompts, CLAUDE.md
- messy prototypes and dead code you are not ready to delete
- test suites and fixtures you don't want to show
- anything else matching an ignore pattern

Typical things that go: `src/`, `servers/`, `skills/` you *do* publish, a
README written for the public repo, a plugin manifest, release notes.

Each working repo has its own `push-ship.config.json`, so one install of the
plugin serves every project you have, each with different sources, targets,
and ignore rules. push-ship never runs git in the target — you review and commit
there yourself.

## Install

As a Claude Code plugin (once, then it works in every project that has a config):

```
/plugin marketplace add jycd25/push-ship
/plugin install push-ship@jycd25
```

For local development of the plugin itself: `claude --plugin-dir /path/to/push-ship`.

As a plain CLI, no Claude Code needed:

```
npx github:jycd25/push-ship --help
# or
npm i -g github:jycd25/push-ship
```

## Set up a working repo

Inside the repo you build in:

```
/push-ship --init
```

Edit the generated `push-ship.config.json`. A real example — a private monorepo
that ships a public Claude Code plugin:

```json
{
  "onStop": "push",
  "ignore": ["*.log", "**/*.tmp", "drafts/"],
  "targets": [
    { "src": "servers",                   "dest": "../thousand-words/servers" },
    { "src": "skills",                    "dest": "../thousand-words/skills", "ignore": ["*-internal.md"] },
    { "src": "hooks",                     "dest": "../thousand-words/hooks" },
    { "src": "docs/cookbook.md",          "dest": "../thousand-words/docs" },
    { "src": ".claude-plugin/plugin.json","dest": "../thousand-words/.claude-plugin" },
    { "src": "RELEASE-NOTES.md",          "dest": "../thousand-words" },
    { "src": "docs/public-README.md",     "dest": "../thousand-words", "rename": "README.md" }
  ]
}
```

Everything *not* listed — `docs/design/`, `.claude/`, `tests/`, `scratch/` —
simply never leaves the working repo. There is nothing to blacklist; you
whitelist what ships. `ignore` is for trimming inside a directory you do ship.

| key | meaning |
| --- | --- |
| `targets[].src` | File or directory, relative to the config file's directory. A directory maps its *contents* onto `dest` (no `src` prefix). A file lands at `dest/<basename>`. |
| `targets[].dest` | Absolute, `~`-prefixed, or relative to the config file's directory. Must already exist. |
| `targets[].rename` | For a file `src` only: the filename to use at `dest` instead of the basename. Lets you ship `docs/public-README.md` as `README.md`. |
| `ignore` | gitignore-style globs, relative to each `src`. Top-level applies to every target; `targets[].ignore` adds more for one target. `name` matches at any depth, `dir/` matches directories only, a pattern containing `/` is anchored to `src`, `*` stays within one segment, `**` spans segments. `.git`, `node_modules`, `.DS_Store` and push-ship's own files are always ignored. |
| `onStop` | What the Stop hook does after each Claude turn: `"push"` (default), `"report"` (print pending changes, write nothing), or `"off"`. |

Add `.push-ship-manifest.json` to the working repo's `.gitignore`; it is
per-machine state. Deleting it forces a full re-push, which is harmless.

## What the plugin does

- **Stop hook** — after each Claude turn, pushes changed files for the project
  in the cwd and shows a one-line summary plus the files that moved. Silent
  when nothing changed. Does nothing in projects without a config.
- **SessionStart hook** — tells Claude the project's targets exist and that
  pushes happen automatically, so "ship this" or "sync the skills dir" works in
  plain language.
- **`/push-ship [names...] [--dry-run] [--init]`** — push on demand, preview,
  or scaffold a config.
- **Skill** — teaches Claude the config format and ignore rules, so it can add a
  target, exclude a file, or explain why something was or wasn't pushed.

## CLI

```
push-ship                  # push every changed file, mirror deletions
push-ship template         # push only files named "template" (extension/dir ignored)
push-ship --dry-run        # preview; writes no files, no manifest, no deletions
push-ship --init           # write a starter push-ship.config.json in the cwd
push-ship --config <path>  # use a specific config file
```

The config is found by walking up from the cwd, so the command works from any
subdirectory. Every run lists each copied file tagged `added` (new at dest) or
`updated` (content changed). Name filters match the basename with or without
extension and never mirror deletions. Exit code is 1 if any target's source or
dest directory is missing.

### Change detection

Every file under each source is hashed (SHA-1) and compared with
`.push-ship-manifest.json`. A file is pushed when its hash differs or it is
missing at dest. The manifest is updated only for files actually pushed, so a
filtered run never marks other pending changes as synced. On full (unfiltered)
runs, files that disappeared from a directory source are also removed from dest
and the manifest, so the shipped repo mirrors the shipped subset exactly.

## Programmatic use

```js
import { pushShip } from 'push-ship';
const result = pushShip({ cwd: '/path/to/project', dryRun: true });
// result.added, result.updated, result.deleted, result.actions, result.errors
```

## Development

```
npm test        # node:test suite (sync, config, ignore)
```

Layout: `src/` engine, `scripts/push-ship.mjs` CLI, `scripts/hook-*.mjs` hook
entry points, `hooks/hooks.json`, `commands/push-ship.md`,
`skills/push-ship/SKILL.md`, `.claude-plugin/`.

## License

MIT
