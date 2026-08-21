#!/bin/bash
# Make a freshly created worktree runnable without any manual steps.
#
# Wired into .claude/settings.json as a WorktreeCreate hook, so it runs on
# creation rather than being remembered. With 43 worktrees, a manual step here
# gets skipped, and a worktree with no .env.local fails in a way that reads like
# a code bug ("supabaseUrl is required") rather than like missing setup.
#
# Two things, both idempotent:
#   1. install dependencies if node_modules is absent
#   2. write .env.local from ~/.studyedge/env.staging
#
# The env file itself stays outside the repo and is never copied into a tracked
# path. scripts/use-env.mjs refuses to write a production URL, so a worktree
# bootstrapped by this script cannot come up pointed at production.

set -u

ROOT="${CLAUDE_WORKTREE_PATH:-$(pwd)}"
cd "$ROOT" || exit 0   # never fail worktree creation over bootstrap

echo "[bootstrap] $ROOT"

if [ ! -d node_modules ]; then
  echo "[bootstrap] installing dependencies"
  npm install --silent --no-audit --no-fund 2>&1 | tail -3
else
  echo "[bootstrap] node_modules present, skipping install"
fi

if [ -f "$HOME/.studyedge/env.staging" ]; then
  if node scripts/use-env.mjs staging; then
    echo "[bootstrap] pointed at staging"
  else
    echo "[bootstrap] WARNING: could not write .env.local, see the error above"
  fi
else
  echo "[bootstrap] WARNING: ~/.studyedge/env.staging not found."
  echo "[bootstrap] The app will refuse to start until it exists. Create it, then run:"
  echo "[bootstrap]   node scripts/use-env.mjs staging"
fi

echo "[bootstrap] done. npm run dev is ready."
exit 0
