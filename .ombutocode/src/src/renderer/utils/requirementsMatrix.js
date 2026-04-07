const MATRIX_PATH = 'Functional Requirements/UseCaseRequirementsMatrix.md';

export { MATRIX_PATH };

export function parseMatrix(content) {
  const links = [];
  const lines = content.split('\n');
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.split('|').map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length);
    if (cells.length < 3) continue;
    if (cells[0] === 'FR ID') { inTable = true; continue; }
    if (cells[0].match(/^-+$/)) continue;
    if (inTable) {
      links.push({ frId: cells[0], ucName: cells[1], ucPath: cells[2] });
    }
  }
  return links;
}

export function serializeMatrix(links) {
  const sorted = [...links].sort((a, b) => a.frId.localeCompare(b.frId) || a.ucName.localeCompare(b.ucName));
  let md = '# Use Case Requirements Matrix\n\n';
  md += '| FR ID | Use Case | Use Case File |\n';
  md += '|-------|----------|---------------|\n';
  for (const l of sorted) {
    md += `| ${l.frId} | ${l.ucName} | ${l.ucPath} |\n`;
  }
  return md;
}

export function getLinksForFR(links, frId) {
  return links.filter(l => l.frId === frId);
}

export function getLinksForUC(links, ucPath) {
  return links.filter(l => l.ucPath === ucPath);
}
