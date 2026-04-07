/**
 * Class Diagram DSL parser/serializer.
 *
 * DSL format:
 *   class "ClassName" @x,y
 *     attr "+ name: String"
 *     attr "- age: int"
 *     op "+ getName(): String"
 *     op "- setAge(a: int): void"
 *
 *   "ClassA" --> "ClassB"
 *   "ClassA" --|> "ClassB"
 *   "ClassA" --o "ClassB"
 *   "ClassA" --* "ClassB"
 */

const REL_ARROWS = {
  '-->': 'association',
  '--|>': 'inheritance',
  '--o': 'aggregation',
  '--*': 'composition',
};

const REL_PATTERN = /^"([^"]+)"\s*(-->|--\|>|--o|--\*)\s*"([^"]+)"$/;

export function parse(source) {
  const classes = [];
  const relationships = [];
  const errors = [];
  let currentClass = null;

  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // class "Name" @x,y
    const classMatch = trimmed.match(/^class\s+"([^"]+)"(?:\s+@(\d+),(\d+))?$/i);
    if (classMatch) {
      currentClass = {
        name: classMatch[1],
        x: classMatch[2] ? parseInt(classMatch[2]) : null,
        y: classMatch[3] ? parseInt(classMatch[3]) : null,
        attributes: [],
        operations: [],
      };
      classes.push(currentClass);
      continue;
    }

    // attr "..."
    const attrMatch = trimmed.match(/^attr\s+"([^"]*)"$/i);
    if (attrMatch && currentClass) {
      currentClass.attributes.push(attrMatch[1]);
      continue;
    }

    // op "..."
    const opMatch = trimmed.match(/^op\s+"([^"]*)"$/i);
    if (opMatch && currentClass) {
      currentClass.operations.push(opMatch[1]);
      continue;
    }

    // relationship
    const relMatch = trimmed.match(REL_PATTERN);
    if (relMatch) {
      currentClass = null;
      relationships.push({
        from: relMatch[1],
        type: REL_ARROWS[relMatch[2]] || 'association',
        to: relMatch[3],
      });
      continue;
    }

    if (trimmed.length > 0) {
      errors.push(`Line ${i + 1}: unrecognized: "${trimmed}"`);
    }
  }

  return { classes, relationships, errors };
}

const ARROW_MAP = {
  'association': '-->',
  'inheritance': '--|>',
  'aggregation': '--o',
  'composition': '--*',
};

export function serialize({ classes, relationships }) {
  const lines = [];

  for (const cls of classes) {
    const pos = (cls.x != null && cls.y != null) ? ` @${Math.round(cls.x)},${Math.round(cls.y)}` : '';
    lines.push(`class "${cls.name}"${pos}`);
    for (const a of cls.attributes) {
      lines.push(`  attr "${a}"`);
    }
    for (const o of cls.operations) {
      lines.push(`  op "${o}"`);
    }
    lines.push('');
  }

  for (const r of relationships) {
    const arrow = ARROW_MAP[r.type] || '-->';
    lines.push(`"${r.from}" ${arrow} "${r.to}"`);
  }

  lines.push('');
  return lines.join('\n');
}
