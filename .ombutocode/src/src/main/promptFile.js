'use strict';

/**
 * Prompt delivery through a temporary file, for agent CLIs that read neither
 * stdin nor a long argv prompt reliably (Grok Build: `grok --prompt-file`).
 *
 * A template opts in with a `promptFile` field holding the prompt text (the
 * same role `stdin` plays for Claude and Codex) and a `{{promptFile}}` token in
 * its args where the file's path belongs:
 *
 *   { "command": "grok",
 *     "args": ["--prompt-file", "{{promptFile}}", "--always-approve"],
 *     "promptFile": "Implement ticket {{ticketId}} ..." }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const PROMPT_FILE_TOKEN = '{{promptFile}}';

function templateUsesPromptFile(template) {
  return typeof template?.promptFile === 'string';
}

/**
 * Write the prompt to a fresh file under the OS temp dir and return its path.
 * The caller deletes it with removePromptFile once the agent has exited.
 */
function writePromptFile(text, { dir = path.join(os.tmpdir(), 'ombuto-prompts') } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `prompt-${randomUUID()}.md`);
  fs.writeFileSync(filePath, String(text ?? ''), 'utf-8');
  return filePath;
}

/**
 * Replace `{{promptFile}}` in args with the file path. When the command will
 * run through a shell (Windows `shell: true`), Node joins argv unescaped, so a
 * path containing whitespace is quoted.
 */
function substitutePromptFile(args, filePath, { shell = false } = {}) {
  const value = shell && /\s/.test(filePath) ? `"${filePath}"` : filePath;
  return (Array.isArray(args) ? args : []).map((arg) => (
    typeof arg === 'string' ? arg.split(PROMPT_FILE_TOKEN).join(value) : arg
  ));
}

function removePromptFile(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (_) {
    // Already gone or locked; the OS temp dir is cleaned eventually.
  }
}

module.exports = {
  PROMPT_FILE_TOKEN,
  templateUsesPromptFile,
  writePromptFile,
  substitutePromptFile,
  removePromptFile
};
