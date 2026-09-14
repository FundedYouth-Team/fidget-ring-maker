#!/usr/bin/env node
// PostToolUse (Write|Edit|NotebookEdit): record the file Claude just touched.
// Appends one TSV line per edit to .claude/changelog-pending.md, which the Stop
// hook drains into CHANGELOG.md. Never fails the tool call.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const IGNORED_PREFIXES = ['.claude/', 'node_modules/', 'dist/', '_ignore/']
const IGNORED_FILES = ['CHANGELOG.md', 'pnpm-lock.yaml', 'tsconfig.tsbuildinfo']

try {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const file =
    input.tool_response?.filePath ||
    input.tool_input?.file_path ||
    input.tool_input?.notebook_path

  if (!file) process.exit(0)

  const rel = path.relative(root, path.resolve(root, file)).split(path.sep).join('/')
  if (!rel || rel.startsWith('..')) process.exit(0) // outside the project
  if (IGNORED_FILES.includes(rel)) process.exit(0)
  if (IGNORED_PREFIXES.some((p) => rel.startsWith(p))) process.exit(0)

  const pending = path.join(root, '.claude', 'changelog-pending.md')
  mkdirSync(path.dirname(pending), { recursive: true })
  appendFileSync(pending, `${new Date().toISOString()}\t${input.tool_name || 'Edit'}\t${rel}\n`)
} catch {
  // A changelog logger must never break an edit.
}
process.exit(0)
