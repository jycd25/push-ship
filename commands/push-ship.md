---
description: Push new/changed files to the target dirs in push-ship.config.json (args: [names...] [--dry-run] [--init])
allowed-tools: Bash(node *)
---

Run push-ship for the current project and report the result.

Execute exactly this command (pass the user's arguments through unchanged):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/push-ship.mjs" $ARGUMENTS
```

Then summarize the output for the user: list each `added`, `updated`, and
`removed` line, and the final count line. If the command printed an error such
as "no push-ship.config.json found", tell the user and offer to run
`/push-ship --init` to create a starter config. If a `dest dir not found` error
appears, tell the user which directory to create; do not create it yourself.

Arguments:
- `names...` — only push files whose basename matches (extension optional). Filtered runs never delete.
- `--dry-run` / `-n` — preview only, write nothing.
- `--init` — write a starter `push-ship.config.json` in the cwd.
- `--config <path>` — use a specific config file.
