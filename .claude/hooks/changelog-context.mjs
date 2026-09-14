#!/usr/bin/env node
// UserPromptSubmit hook: inject the top of CHANGELOG.md (plus any undrained
// pending edits) so recent work is reviewed before acting on a new prompt.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const HEAD_LINES = 80

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const parts = []

  const changelog = path.join(root, 'CHANGELOG.md')
  if (existsSync(changelog)) {
    const head = readFileSync(changelog, 'utf8').split('\n').slice(0, HEAD_LINES).join('\n')
    parts.push(
      'Recent project history from CHANGELOG.md (newest first). Review this before ' +
        'planning the request — it records what has already been built, so prefer ' +
        'extending existing work over rebuilding it, and say so if the request ' +
        'duplicates or reverses something below.\n\n' +
        head
    )
  }

  const pending = path.join(root, '.claude', 'changelog-pending.md')
  if (existsSync(pending)) {
    const files = [
      ...new Set(
        readFileSync(pending, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => l.split('\t')[2])
          .filter(Boolean)
      ),
    ]
    if (files.length > 0) {
      parts.push(
        `Files modified but not yet written to CHANGELOG.md:\n${files
          .map((f) => `  - ${f}`)
          .join('\n')}`
      )
    }
  }

  if (parts.length > 0) {
    console.log(
      JSON.stringify({
        suppressOutput: true,
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: parts.join('\n\n---\n\n'),
        },
      })
    )
  }
} catch {
  // Context injection is best-effort; never block a prompt.
}
process.exit(0)
