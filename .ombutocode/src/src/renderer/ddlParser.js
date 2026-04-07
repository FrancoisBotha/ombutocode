/**
 * Parse PostgreSQL DDL to extract tables, columns, and foreign key relationships.
 */
export function parseDDL(source) {
  const tables = [];
  const relationships = [];

  // Match CREATE TABLE blocks
  const tableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = tableRegex.exec(source)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns = [];

    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim().replace(/,\s*$/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;

      // Skip constraints
      if (/^(UNIQUE|CHECK|PRIMARY\s+KEY|CONSTRAINT|FOREIGN\s+KEY)\s*\(/i.test(trimmed)) continue;

      // Parse column: name type [modifiers] [REFERENCES ...]
      const colMatch = trimmed.match(/^(\w+)\s+([\w()]+(?:\s*\(\d+(?:,\s*\d+)?\))?)/i);
      if (!colMatch) continue;

      const colName = colMatch[1];
      // Skip SQL keywords that aren't column names
      if (/^(UNIQUE|CHECK|CONSTRAINT|PRIMARY|FOREIGN)$/i.test(colName)) continue;

      let colType = colMatch[2];
      const isPK = /PRIMARY\s+KEY/i.test(trimmed);
      const notNull = /NOT\s+NULL/i.test(trimmed);

      // Check for FK reference
      const fkMatch = trimmed.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      if (fkMatch) {
        relationships.push({
          from: tableName,
          fromCol: colName,
          to: fkMatch[1],
          toCol: fkMatch[2],
        });
      }

      columns.push({ name: colName, type: colType, pk: isPK, notNull, fk: fkMatch ? fkMatch[1] : null });
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns });
    }
  }

  return { tables, relationships };
}
