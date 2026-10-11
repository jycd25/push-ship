---
name: push-ship
description: Use when the user asks to push, ship, sync, mirror, publish, or copy this project's files to another directory or repo (e.g. "ship this", "push to the public repo", "sync the skills dir"), or asks to set up / change push-ship.config.json, ignore files from the sync, or asks why files did or didn't get pushed.
---

# push-ship

Purpose: the user builds in one repo (with design docs, AI skills, scratch code,
private tests) and ships a clean subset to another repo. Only listed `src`
entries ever leave; everything else stays behind by construction.

push-ship copies new and changed files from this project's source dirs to
target dirs listed in `push-ship.config.json`, using SHA-1 fingerprints stored
in `.push-ship-manifest.json` so only changed content is copied. On full runs
it also removes files at the target that vanished from the source. It never
runs git in the target.

## What never ships

The target is usually public. Before adding a `src`, ask whether the file
exists for the product or for the way the user works on it. Only product files
ship; when in doubt, leave it out and say so.

- Never add these as targets on your own: `CLAUDE.md`, `AGENTS.md`, `.claude/`,
  `.superpowers/`, skills, agents and prompts used to build the project,
  design docs, plans, experiment logs, scratch files, `.env*`, the working
  repo's `.gitignore`, or push-ship's own files. A request that mentions one of
  them is not a request to ship it: "move the README into CLAUDE.md" means
  edit CLAUDE.md in the working repo. Ship such a file only when the user names
  it and says it should land in the target.
- Do not ship the working repo's dotfiles verbatim. Its `.gitignore` lists what
  the user hides (`.claude/worktrees/`, `run-state.md`, ...) and so reveals it.
  If the target needs a `.gitignore`, write a separate `gitignore.public` with
  only product entries and ship it with `"rename": ".gitignore"`.
- Shipped text leaks too. When you add a target, and whenever a push touches a
  README, a doc or a code comment, grep the target for references to files that
  were not shipped and reword or unlink them in the source file so the fix
  re-ships:

  ```
  grep -rnIE 'CLAUDE\.md|AGENTS\.md|\.claude/|docs/|superpowers|run-state|push-ship' <dest> --exclude-dir=.git --exclude-dir=node_modules
  ```

- Removing a target from the config does not remove its copy at dest, and the
  manifest keeps its entry. Delete the file at dest yourself, drop its entry
  from `.push-ship-manifest.json`, and check `git log` in the target: if the
  file is already committed there, tell the user, since only they decide
  whether to amend or rewrite history.
- Before the first push to a new target, run `--dry-run` and read the whole
  file list against this section, not just the count.

## Commands

All go through the engine shipped with this plugin:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/push-ship.mjs" [names...] [--dry-run] [--config <path>]
node "${CLAUDE_PLUGIN_ROOT}/scripts/push-ship.mjs" --init
```

- No args: push every changed file in every target, mirror deletions.
- `names...`: push only files whose basename matches (`template`, `template.md`
  and `template.html` all match basename `template`). Never deletes.
- `--dry-run`: print what would happen, write nothing. Use this first when the
  user seems unsure, or before a run that would remove files.
- `--init`: create a starter config in the cwd.

Use `--dry-run` to answer "what would get pushed?" and "why wasn't X pushed?"
(a file is skipped when its hash matches the manifest and it exists at dest, or
when it matches an ignore pattern).

## Automatic behaviour

The plugin's Stop hook runs a full push after each of your turns whenever the
cwd (or an ancestor) has `push-ship.config.json`, unless `"onStop"` is
`"report"` (print pending changes only) or `"off"`. You do not need to run
push-ship yourself at the end of a task; mention that the hook will push. Run it
manually only when the user asks, wants a dry run, or wants a filtered push.

## Config: `push-ship.config.json`

Lives at the project root (the directory it sits in becomes the root). Example:

```json
{
  "onStop": "push",
  "ignore": ["*.log", "drafts/", "**/*.tmp"],
  "targets": [
    { "src": "skills", "dest": "/Users/me/github/other-repo/skills" },
    { "src": "docs/images", "dest": "../other-repo/docs/images", "ignore": ["*.psd"] },
    { "src": "docs/public-README.md", "dest": "~/github/other-repo", "rename": "README.md" }
  ]
}
```

- `src`: file or directory, relative to the config dir. A directory maps its
  contents onto `dest` (no src prefix). A file lands at `dest/<basename>`.
- `dest`: absolute, `~`-prefixed, or relative to the config dir. Must already
  exist; push-ship reports an error rather than creating top-level dest dirs.
- `rename` (file sources only): filename to use at `dest` instead of the
  basename, e.g. ship `docs/public-README.md` as `README.md`.
- `ignore` (top-level and/or per target): gitignore-style globs matched against
  the path relative to `src`. `name` matches at any depth, `dir/` matches
  directories only, a pattern containing `/` is anchored to `src`, `*` stays
  within one segment, `**` spans segments. `.git`, `node_modules`, `.DS_Store`
  and push-ship's own files are always ignored.
- `onStop`: `"push"` (default), `"report"`, or `"off"`.

When the user asks to add a sync target or ignore something, edit this file
directly, check the new `src` against "What never ships", then offer a
`--dry-run` to confirm.

## State

`.push-ship-manifest.json` beside the config is per-machine state; it belongs
in `.gitignore`. Deleting it forces a full re-push, which is harmless.
