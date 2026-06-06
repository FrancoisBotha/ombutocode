/**
 * Skill category support.
 *
 * Skills are Markdown documents under docs/Skills/. Categories are expressed
 * as a simple one-level folder structure: docs/Skills/<Category>/<skill>.md.
 * Files sitting directly in docs/Skills/ are treated as category 'Other'.
 * Sub-folders outside the canonical list still work — the folder name becomes
 * the category label and the group sorts just before 'Other'.
 */

export const SKILL_CATEGORIES = [
  'PRD',
  'Architecture',
  'Styling',
  'Epics',
  'BDD',
  'Ticket Generation',
  'Diagnostics',
  'Bootstrapping',
  'Other',
];

function toSkill(file, category) {
  return {
    path: file.path,
    name: file.name,
    displayName: file.name.replace(/\.md$/i, '').replace(/_/g, ' '),
    category,
  };
}

function categoryRank(category) {
  const index = SKILL_CATEGORIES.indexOf(category);
  // Unknown folders sort as a group just before 'Other'
  return index === -1 ? SKILL_CATEGORIES.length - 1.5 : index;
}

/**
 * Collect all skill .md files from a filetree:scan result, one folder level
 * deep, with a category derived from the sub-folder name.
 * @param {object} tree - result of the 'filetree:scan' IPC call
 * @returns {Array<{path: string, name: string, displayName: string, category: string}>}
 */
export function collectSkillFiles(tree) {
  const folder = tree?.children?.find((c) => c.name === 'Skills');
  if (!folder || !Array.isArray(folder.children)) return [];

  const skills = [];
  for (const child of folder.children) {
    if (child.type === 'file' && child.name.endsWith('.md')) {
      skills.push(toSkill(child, 'Other'));
    } else if (child.type === 'folder' && Array.isArray(child.children)) {
      for (const file of child.children) {
        if (file.type === 'file' && file.name.endsWith('.md')) {
          skills.push(toSkill(file, child.name));
        }
      }
    }
  }

  return skills.sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      a.category.localeCompare(b.category) ||
      a.displayName.localeCompare(b.displayName)
  );
}

/**
 * Restrict a skill list to one category — e.g. the PRD page only shows
 * PRD skills. Falls back to the full list when the category is empty
 * (old flat projects, or nothing filed there yet) so the picker is never
 * needlessly blank.
 */
export function filterSkillsByCategory(skills, category) {
  if (!category) return skills;
  const filtered = skills.filter((s) => s.category === category);
  return filtered.length ? filtered : skills;
}

/**
 * Group a flat skill list into [{ category, skills }] preserving order —
 * ready for <optgroup> rendering or sectioned lists.
 */
export function groupSkillFiles(skills) {
  const groups = [];
  for (const skill of skills) {
    let group = groups.find((g) => g.category === skill.category);
    if (!group) {
      group = { category: skill.category, skills: [] };
      groups.push(group);
    }
    group.skills.push(skill);
  }
  return groups;
}
