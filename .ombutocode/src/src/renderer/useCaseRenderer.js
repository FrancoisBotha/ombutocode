/**
 * Custom UML Use Case Diagram parser/serializer.
 *
 * DSL format:
 *   actor "Actor Name" @x,y
 *   usecase "Use Case Name" @x,y
 *   "Actor Name" --> "Use Case Name"
 *   "UC A" ..extends..> "UC B"
 *   "UC A" ..includes..> "UC B"
 */

const REL_ARROWS = {
  '-->': 'association',
  '..extends..>': 'extends',
  '..includes..>': 'includes',
};

const REL_PATTERN = /^(?:"([^"]+)"|(\S+))\s*(-->|\.\.extends\.\.>|\.\.includes\.\.>)\s*(?:"([^"]+)"|(\S+))$/;

/**
 * Parse the DSL source into actors, use cases, and relationships.
 */
export function parse(source) {
  const actors = [];
  const useCases = [];
  const relationships = [];
  const errors = [];

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue;

    // actor <name> @x,y
    const actorMatch = raw.match(/^actor\s+(?:"([^"]+)"|(\S+))(?:\s+@(\d+),(\d+))?$/i);
    if (actorMatch) {
      const name = actorMatch[1] || actorMatch[2];
      const x = actorMatch[3] ? parseInt(actorMatch[3]) : null;
      const y = actorMatch[4] ? parseInt(actorMatch[4]) : null;
      if (!actors.find(a => a.name === name)) {
        actors.push({ name, x, y });
      }
      continue;
    }

    // usecase "<name>" @x,y
    const ucMatch = raw.match(/^usecase\s+(?:"([^"]+)"|(\S+))(?:\s+@(\d+),(\d+))?$/i);
    if (ucMatch) {
      const name = ucMatch[1] || ucMatch[2];
      const x = ucMatch[3] ? parseInt(ucMatch[3]) : null;
      const y = ucMatch[4] ? parseInt(ucMatch[4]) : null;
      if (!useCases.find(u => u.name === name)) {
        useCases.push({ name, x, y });
      }
      continue;
    }

    // relationship: <from> --> / ..extends..> / ..includes..> <to>
    const relMatch = raw.match(REL_PATTERN);
    if (relMatch) {
      const from = relMatch[1] || relMatch[2];
      const arrow = relMatch[3];
      const to = relMatch[4] || relMatch[5];
      relationships.push({ from, to, type: REL_ARROWS[arrow] || 'association' });
      continue;
    }

    if (raw.length > 0) {
      errors.push(`Line ${i + 1}: unrecognized syntax: "${raw}"`);
    }
  }

  return { actors, useCases, relationships, errors };
}

const ARROW_MAP = {
  'association': '-->',
  'extends': '..extends..>',
  'includes': '..includes..>',
};

/**
 * Serialize diagram state back to DSL text.
 */
export function serialize({ actors, useCases, relationships }) {
  const lines = [];

  for (const a of actors) {
    const pos = (a.x != null && a.y != null) ? ` @${Math.round(a.x)},${Math.round(a.y)}` : '';
    lines.push(`actor "${a.name}"${pos}`);
  }

  if (actors.length && useCases.length) lines.push('');

  for (const uc of useCases) {
    const pos = (uc.x != null && uc.y != null) ? ` @${Math.round(uc.x)},${Math.round(uc.y)}` : '';
    lines.push(`usecase "${uc.name}"${pos}`);
  }

  if (relationships.length && (actors.length || useCases.length)) lines.push('');

  for (const r of relationships) {
    const arrow = ARROW_MAP[r.type] || '-->';
    lines.push(`"${r.from}" ${arrow} "${r.to}"`);
  }

  lines.push('');
  return lines.join('\n');
}
