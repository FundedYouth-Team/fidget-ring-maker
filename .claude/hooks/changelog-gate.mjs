#!/usr/bin/env node
// Stop hook: if files were modified this turn but CHANGELOG.md was not updated,
// block the stop once and tell Claude to write the entry. Self-terminating —
// draining .claude/changelog-pending.md clears the condition, and
// stop_hook_active guarantees it can never fire twice in a row.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  if (input.stop_hook_active) process.exit(0)

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const pending = path.join(root, '.claude', 'changelog-pending.md')
  if (!existsSync(pending)) process.exit(0)

  const lines = readFileSync(pending, 'utf8').split('\n').filter((l) => l.trim())
  if (lines.length === 0) process.exit(0)

  const files = [...new Set(lines.map((l) => l.split('\t')[2]).filter(Boolean))]

  console.log(
    JSON.stringify({
      decision: 'block',
      reason: [
        'CHANGELOG.md has not been updated for this turn. Before stopping:',
        '',
        `1. Add ONE entry to the "## [Unreleased]" section at the top of CHANGELOG.md`,
        '   describing what changed in this turn, in the user-facing terms of the app',
        '   (parts, tools, physics, UI) — not a list of function names. Group under',
        '   ### Added / ### Changed / ### Fixed / ### Removed as appropriate, and merge',
        '   into the existing Unreleased bullets rather than duplicating them.',
        '2. Overwrite .claude/changelog-pending.md with an empty string.',
        '3. Stop. Do not start new work, and do not re-summarize the whole file.',
        '',
        `Files modified this turn (${files.length}):`,
        ...files.map((f) => `  - ${f}`),
      ].join('\n'),
    })
  )
} catch {
  // Never wedge the session on a changelog bookkeeping failure.
}
process.exit(0)
