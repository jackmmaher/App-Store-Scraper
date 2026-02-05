/**
 * Extracts tagged JSON blocks from generated blueprint markdown.
 *
 * Blueprint prompts instruct Claude to emit JSON blocks tagged like:
 *   ```json:design-tokens
 *   { ... }
 *   ```
 *
 * This module extracts those blocks for storage in structured_specs.
 */

export interface StructuredSpecs {
  designTokens?: Record<string, unknown>;
  dataModels?: Record<string, unknown>;
  screens?: Record<string, unknown>;
  features?: Record<string, unknown>;
}

const TAG_MAP: Record<string, keyof StructuredSpecs> = {
  'design-tokens': 'designTokens',
  'data-models': 'dataModels',
  'screens': 'screens',
  'features': 'features',
};

/**
 * Extract a tagged JSON block from markdown content.
 * Looks for ```json:tag-name ... ``` patterns.
 */
export function extractTaggedJson(content: string, tag: string): Record<string, unknown> | null {
  // Match ```json:tag or ```json:tag  (with optional whitespace)
  const pattern = new RegExp(
    '```json:' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([\\s\\S]*?)\\n```',
    'm'
  );
  const match = content.match(pattern);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1].trim());
  } catch {
    // Try to fix common JSON issues (trailing commas)
    try {
      const cleaned = match[1].trim().replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(cleaned);
    } catch {
      console.error(`[JSON Extractor] Failed to parse ${tag} JSON block`);
      return null;
    }
  }
}

/**
 * Extract all structured specs from a blueprint section's generated content.
 * Call this after each section generation to accumulate structured data.
 */
export function extractStructuredSpecs(
  sectionName: string,
  content: string,
  existingSpecs: StructuredSpecs = {},
): StructuredSpecs {
  const specs = { ...existingSpecs };

  // Each section may contain specific tagged blocks
  switch (sectionName) {
    case 'design_system': {
      const tokens = extractTaggedJson(content, 'design-tokens');
      if (tokens) specs.designTokens = tokens;
      break;
    }
    case 'tech_stack': {
      const models = extractTaggedJson(content, 'data-models');
      if (models) specs.dataModels = models;
      break;
    }
    case 'wireframes': {
      const screens = extractTaggedJson(content, 'screens');
      if (screens) specs.screens = screens;
      break;
    }
    case 'prd': {
      const features = extractTaggedJson(content, 'features');
      if (features) specs.features = features;
      break;
    }
  }

  return specs;
}
