/**
 * progress-generator.ts
 *
 * Generates PROGRESS.md from a BUILD_MANIFEST.md string.
 * Parses phase headers and task items to produce a checklist.
 */

/**
 * Generate a PROGRESS.md checklist from the build manifest content.
 *
 * @param buildManifest - The raw BUILD_MANIFEST.md markdown string
 * @param appName       - The chosen app name
 */
export function generateProgressMd(
  buildManifest: string,
  appName: string
): string {
  try {
    const sections = parseManifest(buildManifest);

    const lines: string[] = [];
    lines.push(`# ${appName} — Build Progress`);
    lines.push('');
    lines.push(
      '> Update this file as you complete each task from BUILD_MANIFEST.md'
    );

    for (const section of sections) {
      lines.push('');
      lines.push(`## ${section.title}`);
      lines.push('');
      for (const task of section.tasks) {
        lines.push(`- [ ] ${task}`);
      }
    }

    // Add summary footer
    const totalTasks = sections.reduce(
      (sum, s) => sum + s.tasks.length,
      0
    );
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(`**Total Tasks:** ${totalTasks}`);
    lines.push('**Completed:** 0');
    lines.push(`**Remaining:** ${totalTasks}`);
    lines.push('');

    return lines.join('\n');
  } catch {
    // Fallback: return a minimal progress file
    return `# ${appName} — Build Progress

> Update this file as you complete each task from BUILD_MANIFEST.md

*Could not auto-generate checklist. Refer to BUILD_MANIFEST.md for tasks.*
`;
  }
}

// ---------------------------------------------------------------------------
// Internal parsing
// ---------------------------------------------------------------------------

interface ManifestSection {
  title: string;
  tasks: string[];
}

/**
 * Parse the build manifest to extract phase sections and their tasks.
 *
 * Expected patterns:
 *   Phase headers: "## Phase N: Title" or "## Phase N - Title"
 *   Task items:    "### Task N: Title" or "### Task N - Title" or "### Task N. Title"
 */
function parseManifest(manifest: string): ManifestSection[] {
  const sections: ManifestSection[] = [];
  let currentSection: ManifestSection | null = null;

  const lines = manifest.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for phase heading: ## Phase N: Title (also ## Phase N - Title)
    const phaseMatch = trimmed.match(
      /^##\s+(?:Phase\s+\d+\s*[:.\-]\s*)?(.+)/i
    );
    if (phaseMatch && !trimmed.startsWith('###')) {
      // Ignore non-phase ## headings that are clearly not phases
      // (like "## Completion Checklist", "## From Pareto Strategy")
      const title = phaseMatch[1].trim();

      // Heuristic: if the heading contains "Phase" or starts with a pattern
      // that looks like a build phase, treat it as a section
      const isPhase =
        /phase\s*\d/i.test(trimmed) ||
        /^##\s+(?:Project Setup|Data Models|Core Views|Features|StoreKit|Polish|Testing|Launch)/i.test(
          trimmed
        );

      // Also accept any ## heading that comes before ### Task lines
      if (isPhase || currentSection === null) {
        currentSection = { title, tasks: [] };
        sections.push(currentSection);
      }
      continue;
    }

    // Check for task heading: ### Task N: Title
    const taskMatch = trimmed.match(
      /^###\s+Task\s+(\d+)\s*[:.\-]\s*(.+)/i
    );
    if (taskMatch && currentSection) {
      const taskNum = taskMatch[1];
      const taskTitle = taskMatch[2].trim();
      currentSection.tasks.push(`Task ${taskNum}: ${taskTitle}`);
      continue;
    }

    // Also handle unnumbered task patterns: ### Title (when inside a phase)
    // Only if there is no "Task N" pattern but we are in a phase
    // We skip this to avoid false positives from other ### headings
  }

  // Filter out sections with no tasks (likely non-phase headings)
  return sections.filter((s) => s.tasks.length > 0);
}
