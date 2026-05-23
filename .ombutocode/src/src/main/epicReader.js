'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Read every `epic_*.md` file in `epicsDir` and return a structured list:
 *   [{ stem, fileName, status, dependsOn: string[] }]
 *
 * Parsing rules:
 * - `stem` is the filename without `.md` extension (e.g. `epic_03_DROPBOX_AUTH`).
 * - `status` comes from the first line matching /^Status:\s*(.+)$/i (case-insensitive).
 *   Returned uppercased so callers can compare against the canonical lifecycle
 *   values NEW / TICKETS / BUILDING / DONE without worrying about casing.
 * - `dependsOn` comes from /^Depends On:\s*(.+)$/i. Value is split on commas,
 *   each entry is trimmed and normalised (strip a `.md` suffix if present, strip
 *   the `docs/Epics/` prefix if present) so dependencies survive whether the
 *   author writes `epic_01_FOO`, `epic_01_FOO.md`, or `docs/Epics/epic_01_FOO.md`.
 *
 * Missing epic file or unreadable epics directory yields an empty list — the
 * scheduler treats "no info" as "no gate" rather than blocking everything.
 */
function readEpics(epicsDir, { fsImpl = fs } = {}) {
  let entries;
  try {
    entries = fsImpl.readdirSync(epicsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const epicFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name);

  const out = [];
  for (const fileName of epicFiles) {
    let content;
    try {
      content = fsImpl.readFileSync(path.join(epicsDir, fileName), 'utf-8');
    } catch {
      continue;
    }
    const stem = fileName.replace(/\.md$/i, '');
    const lines = content.split(/\r?\n/);

    let status = '';
    let dependsOn = [];
    for (const line of lines) {
      const statusMatch = line.match(/^Status:\s*\*?\*?\s*(.+?)\s*\*?\*?\s*$/i);
      if (statusMatch && !status) {
        status = statusMatch[1].trim().toUpperCase();
        continue;
      }
      const depsMatch = line.match(/^Depends On:\s*(.+?)\s*$/i);
      if (depsMatch && dependsOn.length === 0) {
        dependsOn = parseDependsList(depsMatch[1]);
      }
    }

    out.push({ stem, fileName, status, dependsOn });
  }
  return out;
}

/**
 * Split a comma-separated "Depends On:" value and normalise each entry to an
 * epic stem (filename without .md or path prefix). Empty / whitespace entries
 * are dropped.
 */
function parseDependsList(raw) {
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      // Strip docs/Epics/ prefix if the author wrote a full path.
      const stripped = part.replace(/^docs[\\/]Epics[\\/]/i, '');
      // Strip .md extension if present.
      return stripped.replace(/\.md$/i, '');
    });
}

/**
 * Build an epic-readiness gate from a parsed epic list.
 *
 * Returns an object with:
 *   - `isEpicReady(stem)` — true iff the epic with that stem has all of its
 *     own dependencies satisfied (transitively walked, with cycle protection).
 *     An epic with no deps is always ready.
 *   - `isTicketAllowed(ticket)` — true iff the ticket's parent epic (resolved
 *     via `ticket.epic_ref`) is itself ready. Tickets without an epic_ref, or
 *     tickets whose epic_ref doesn't resolve to a known epic, are always allowed.
 *
 * `satisfiedStatuses` — the set of epic statuses that count as "the dep is done".
 * Default is `['DONE']` (strict). Pass `['BUILDING', 'DONE']` for the lenient mode.
 */
function createEpicReadinessGate(epics, { satisfiedStatuses = ['DONE'] } = {}) {
  const byStem = new Map();
  for (const epic of epics) byStem.set(epic.stem, epic);
  const satisfied = new Set(satisfiedStatuses.map((s) => String(s).toUpperCase()));

  const memo = new Map();
  function isEpicReady(stem, seen = new Set()) {
    if (memo.has(stem)) return memo.get(stem);
    if (seen.has(stem)) return true; // cycle — treat as ready to avoid deadlock
    const epic = byStem.get(stem);
    if (!epic) return true; // unknown epic stem — don't block
    seen.add(stem);
    for (const depStem of epic.dependsOn || []) {
      const depEpic = byStem.get(depStem);
      if (!depEpic) continue; // dep points to unknown epic — don't block
      if (!satisfied.has(depEpic.status)) {
        memo.set(stem, false);
        return false;
      }
      if (!isEpicReady(depStem, seen)) {
        memo.set(stem, false);
        return false;
      }
    }
    memo.set(stem, true);
    return true;
  }

  function isTicketAllowed(ticket) {
    const ref = ticket && ticket.epic_ref;
    if (!ref) return true;
    // epic_ref is typically `docs/Epics/epic_NN_NAME.md` — extract the stem.
    const stem = String(ref)
      .replace(/^docs[\\/]Epics[\\/]/i, '')
      .replace(/\.md$/i, '');
    return isEpicReady(stem);
  }

  return { isEpicReady, isTicketAllowed };
}

module.exports = { readEpics, parseDependsList, createEpicReadinessGate };
