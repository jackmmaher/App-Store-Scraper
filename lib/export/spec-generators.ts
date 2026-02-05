/**
 * spec-generators.ts
 *
 * Extracts structured JSON specs from blueprint markdown content.
 * Each function uses regex patterns to parse markdown tables and code blocks,
 * returning typed specs with sensible defaults when extraction fails.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DesignTokensSpec {
  colors: {
    primary: { light: string; dark: string };
    secondary: { light: string; dark: string };
    accent: { light: string; dark: string };
    background: { light: string; dark: string };
    secondaryBackground: { light: string; dark: string };
    text: { light: string; dark: string };
    secondaryText: { light: string; dark: string };
    success: { light: string; dark: string };
    warning: { light: string; dark: string };
    error: { light: string; dark: string };
    info: { light: string; dark: string };
  };
  spacing: Record<string, number>;
  cornerRadius: Record<string, number>;
  shadows: Array<{ name: string; value: string }>;
  typography: {
    fontFamily: string;
    scale: Array<{
      name: string;
      size: number;
      weight: string;
      lineHeight: number;
      letterSpacing: number;
      usage: string;
    }>;
  };
}

export interface DataModelsSpec {
  models: Array<{
    name: string;
    properties: Array<{
      name: string;
      type: string;
      optional: boolean;
      defaultValue?: string;
    }>;
    relationships: Array<{
      name: string;
      type: string;
      deleteRule?: string;
    }>;
  }>;
}

export interface ScreensSpec {
  screens: Array<{
    id: string;
    name: string;
    type: string;
    purpose: string;
    elements: string[];
    navigatesTo: string[];
  }>;
  navigationStructure: {
    rootType: 'tab' | 'navigation_stack' | 'sidebar';
    tabs?: Array<{ name: string; icon: string; screenId: string }>;
  };
}

export interface FeaturesSpec {
  features: Array<{
    name: string;
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    phase: 'mvp' | 'post_launch' | 'future';
    userStory: string;
    acceptanceCriteria: string[];
  }>;
}

export interface AppConfigSpec {
  appName: string;
  bundleIdSuggestion: string;
  minIOS: string;
  swiftVersion: string;
  architecture: string;
  entitlements: string[];
  frameworks: string[];
  permissions: Array<{ key: string; description: string }>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS: DesignTokensSpec['colors'] = {
  primary: { light: '#007AFF', dark: '#0A84FF' },
  secondary: { light: '#5856D6', dark: '#5E5CE6' },
  accent: { light: '#FF9500', dark: '#FF9F0A' },
  background: { light: '#FFFFFF', dark: '#000000' },
  secondaryBackground: { light: '#F2F2F7', dark: '#1C1C1E' },
  text: { light: '#000000', dark: '#FFFFFF' },
  secondaryText: { light: '#6B7280', dark: '#9CA3AF' },
  success: { light: '#34C759', dark: '#30D158' },
  warning: { light: '#FF9500', dark: '#FF9F0A' },
  error: { light: '#FF3B30', dark: '#FF453A' },
  info: { light: '#007AFF', dark: '#0A84FF' },
};

const DEFAULT_SPACING: Record<string, number> = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
};

const DEFAULT_CORNER_RADIUS: Record<string, number> = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

const DEFAULT_SHADOWS: DesignTokensSpec['shadows'] = [
  { name: 'elevation-0', value: 'none' },
  { name: 'elevation-1', value: '0 1px 2px rgba(0,0,0,0.05)' },
  { name: 'elevation-2', value: '0 4px 6px rgba(0,0,0,0.07)' },
  { name: 'elevation-3', value: '0 10px 15px rgba(0,0,0,0.1)' },
  { name: 'elevation-4', value: '0 20px 25px rgba(0,0,0,0.15)' },
];

const DEFAULT_TYPOGRAPHY: DesignTokensSpec['typography'] = {
  fontFamily: 'SF Pro',
  scale: [
    { name: 'Large Title', size: 34, weight: 'Bold', lineHeight: 41, letterSpacing: 0.37, usage: 'Main screen titles' },
    { name: 'Title 1', size: 28, weight: 'Bold', lineHeight: 34, letterSpacing: 0.36, usage: 'Section headers' },
    { name: 'Title 2', size: 22, weight: 'Bold', lineHeight: 28, letterSpacing: 0.35, usage: 'Card titles' },
    { name: 'Title 3', size: 20, weight: 'Semibold', lineHeight: 25, letterSpacing: 0.38, usage: 'List headers' },
    { name: 'Headline', size: 17, weight: 'Semibold', lineHeight: 22, letterSpacing: -0.43, usage: 'Emphasized text' },
    { name: 'Body', size: 17, weight: 'Regular', lineHeight: 22, letterSpacing: -0.43, usage: 'Main content' },
    { name: 'Callout', size: 16, weight: 'Regular', lineHeight: 21, letterSpacing: -0.31, usage: 'Secondary content' },
    { name: 'Subheadline', size: 15, weight: 'Regular', lineHeight: 20, letterSpacing: -0.23, usage: 'Supporting text' },
    { name: 'Footnote', size: 13, weight: 'Regular', lineHeight: 18, letterSpacing: -0.08, usage: 'Fine print' },
    { name: 'Caption 1', size: 12, weight: 'Regular', lineHeight: 16, letterSpacing: 0, usage: 'Labels' },
    { name: 'Caption 2', size: 11, weight: 'Regular', lineHeight: 13, letterSpacing: 0.06, usage: 'Timestamps' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a hex string to 6-character uppercase without leading '#'. */
function normalizeHex(raw: string): string {
  let hex = raw.trim().replace(/^#/, '');
  // Expand 3-char shorthand
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return hex.length === 6 ? hex.toUpperCase() : '';
}

/** Parse a number from a string, returning fallback on failure. */
function parseNum(val: string, fallback: number): number {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Extract rows from a markdown table.
 * Returns an array of arrays of cell strings (trimmed).
 * Skips the header separator row (---).
 */
function parseMarkdownTable(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    // Skip separator rows
    if (/^\|[\s-:|]+\|$/.test(trimmed)) continue;
    const cells = trimmed
      .split('|')
      .slice(1, -1) // remove leading/trailing empty from split
      .map((c) => c.trim());
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  // Remove the header row (first data row) if there are at least 2 rows
  // Actually the caller should decide, so return all rows
  return rows;
}

/**
 * Attempt to find a table section by heading, returning table rows
 * (excluding the header row).
 */
function findTableAfterHeading(
  markdown: string,
  headingPattern: RegExp
): string[][] {
  const match = headingPattern.exec(markdown);
  if (!match) return [];

  // Get content after heading until next heading or end
  const startIdx = match.index + match[0].length;
  const nextHeading = markdown.slice(startIdx).search(/\n#{1,4}\s/);
  const sectionText =
    nextHeading >= 0
      ? markdown.slice(startIdx, startIdx + nextHeading)
      : markdown.slice(startIdx);

  const rows = parseMarkdownTable(sectionText);
  // Skip header row (first row is usually column titles)
  return rows.length > 1 ? rows.slice(1) : [];
}

// ---------------------------------------------------------------------------
// extractDesignTokens
// ---------------------------------------------------------------------------

export function extractDesignTokens(
  designSystemMarkdown: string
): DesignTokensSpec {
  try {
    const colors = { ...DEFAULT_COLORS };
    const spacing = { ...DEFAULT_SPACING };
    const cornerRadius = { ...DEFAULT_CORNER_RADIUS };
    let shadows = [...DEFAULT_SHADOWS];
    const typography = {
      fontFamily: DEFAULT_TYPOGRAPHY.fontFamily,
      scale: [...DEFAULT_TYPOGRAPHY.scale],
    };

    // --- Colors ---
    // Try to match color table rows like: | Primary | #007AFF | #0A84FF | ... |
    // or: | Primary | #007AFF | #0A84FF | Main actions, brand |
    const colorNameMap: Record<string, keyof typeof colors> = {
      primary: 'primary',
      secondary: 'secondary',
      accent: 'accent',
      background: 'background',
      'secondary bg': 'secondaryBackground',
      'secondary background': 'secondaryBackground',
      'tertiary bg': 'secondaryBackground',
      'primary text': 'text',
      text: 'text',
      'secondary text': 'secondaryText',
      success: 'success',
      warning: 'warning',
      error: 'error',
      info: 'info',
    };

    // Find all color table rows across the entire markdown
    const colorRowPattern =
      /\|\s*([^|]+?)\s*\|\s*(#[0-9A-Fa-f]{3,6})\s*\|\s*(#[0-9A-Fa-f]{3,6})\s*\|/g;
    let colorMatch: RegExpExecArray | null;
    while ((colorMatch = colorRowPattern.exec(designSystemMarkdown)) !== null) {
      const name = colorMatch[1].trim().toLowerCase();
      const lightHex = normalizeHex(colorMatch[2]);
      const darkHex = normalizeHex(colorMatch[3]);

      if (!lightHex || !darkHex) continue;

      const key = colorNameMap[name];
      if (key) {
        colors[key] = { light: `#${lightHex}`, dark: `#${darkHex}` };
      }
    }

    // --- Spacing ---
    // Pattern: | spacing-xs | 4pt | or | spacing-xs | 4 |
    const spacingRowPattern =
      /\|\s*spacing[- ](\w+)\s*\|\s*(\d+)\s*(?:pt)?\s*\|/gi;
    let spacingMatch: RegExpExecArray | null;
    while (
      (spacingMatch = spacingRowPattern.exec(designSystemMarkdown)) !== null
    ) {
      const token = spacingMatch[1].toLowerCase();
      const value = parseInt(spacingMatch[2], 10);
      if (Number.isFinite(value)) {
        spacing[token] = value;
      }
    }

    // --- Corner Radius ---
    // Pattern: | radius-sm | 4pt | or | radius-sm | 4 |
    const radiusRowPattern =
      /\|\s*radius[- ](\w+)\s*\|\s*(\d+)\s*(?:pt)?\s*\|/gi;
    let radiusMatch: RegExpExecArray | null;
    while (
      (radiusMatch = radiusRowPattern.exec(designSystemMarkdown)) !== null
    ) {
      const token = radiusMatch[1].toLowerCase();
      const value = parseInt(radiusMatch[2], 10);
      if (Number.isFinite(value)) {
        cornerRadius[token] = value;
      }
    }

    // --- Shadows ---
    // Pattern: | elevation-N | shadow-value | usage |
    const shadowRows = findTableAfterHeading(
      designSystemMarkdown,
      /#{1,4}\s*\d*\.?\s*Shadows\b/i
    );
    if (shadowRows.length > 0) {
      const parsed: Array<{ name: string; value: string }> = [];
      for (const row of shadowRows) {
        if (row.length >= 2) {
          parsed.push({ name: row[0], value: row[1] });
        }
      }
      if (parsed.length > 0) {
        shadows = parsed;
      }
    }

    // --- Typography ---
    // Extract font family
    const fontFamilyMatch = designSystemMarkdown.match(
      /\*\*Font Family:\*\*\s*(.+)/i
    );
    if (fontFamilyMatch?.[1]) {
      typography.fontFamily = fontFamilyMatch[1].trim();
    }

    // Extract type scale table rows
    // Pattern: | Style | Size | Weight | Line Height | Letter Spacing | Usage |
    const typeRows = findTableAfterHeading(
      designSystemMarkdown,
      /#{1,4}\s*\d*\.?\s*Typography Scale\b/i
    );
    if (typeRows.length > 0) {
      const parsed: DesignTokensSpec['typography']['scale'] = [];
      for (const row of typeRows) {
        if (row.length >= 6) {
          parsed.push({
            name: row[0],
            size: parseNum(row[1].replace(/pt$/i, ''), 17),
            weight: row[2],
            lineHeight: parseNum(row[3].replace(/pt$/i, ''), 22),
            letterSpacing: parseNum(row[4].replace(/pt$/i, ''), 0),
            usage: row[5],
          });
        }
      }
      if (parsed.length > 0) {
        typography.scale = parsed;
      }
    }

    return { colors, spacing, cornerRadius, shadows, typography };
  } catch {
    // Return fully-defaulted spec on any failure
    return {
      colors: { ...DEFAULT_COLORS },
      spacing: { ...DEFAULT_SPACING },
      cornerRadius: { ...DEFAULT_CORNER_RADIUS },
      shadows: [...DEFAULT_SHADOWS],
      typography: {
        fontFamily: DEFAULT_TYPOGRAPHY.fontFamily,
        scale: [...DEFAULT_TYPOGRAPHY.scale],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// extractDataModels
// ---------------------------------------------------------------------------

export function extractDataModels(techStackMarkdown: string): DataModelsSpec {
  try {
    const models: DataModelsSpec['models'] = [];

    // Find Swift code blocks containing @Model definitions
    const codeBlockPattern = /```swift([\s\S]*?)```/g;
    let blockMatch: RegExpExecArray | null;

    while (
      (blockMatch = codeBlockPattern.exec(techStackMarkdown)) !== null
    ) {
      const code = blockMatch[1];

      // Split on @Model to handle multiple models in one block
      const modelChunks = code.split(/(?=@Model)/);

      for (const chunk of modelChunks) {
        if (!chunk.includes('@Model')) continue;

        // Extract class name
        const classMatch = chunk.match(
          /@Model\s*\n?\s*(?:final\s+)?class\s+(\w+)/
        );
        if (!classMatch) continue;

        const modelName = classMatch[1];
        const properties: DataModelsSpec['models'][0]['properties'] = [];
        const relationships: DataModelsSpec['models'][0]['relationships'] = [];

        // Extract properties: var name: Type or var name: Type = defaultValue
        const propPattern =
          /\bvar\s+(\w+)\s*:\s*([^=\n{]+?)(?:\s*=\s*([^\n]+?))?\s*$/gm;
        let propMatch: RegExpExecArray | null;

        while ((propMatch = propPattern.exec(chunk)) !== null) {
          const propName = propMatch[1].trim();
          let propType = propMatch[2].trim();
          const defaultVal = propMatch[3]?.trim();

          // Skip if it looks like a relationship (handled below)
          if (chunk.includes(`@Relationship`) && isRelationshipProperty(chunk, propName)) {
            continue;
          }

          const optional = propType.endsWith('?');
          propType = propType.replace(/\?$/, '');

          const prop: DataModelsSpec['models'][0]['properties'][0] = {
            name: propName,
            type: propType,
            optional,
          };
          if (defaultVal !== undefined) {
            prop.defaultValue = defaultVal;
          }
          properties.push(prop);
        }

        // Extract relationships: @Relationship(...) var name: Type
        const relPattern =
          /@Relationship\(([^)]*)\)\s*\n?\s*var\s+(\w+)\s*:\s*([^\n=]+)/g;
        let relMatch: RegExpExecArray | null;

        while ((relMatch = relPattern.exec(chunk)) !== null) {
          const relArgs = relMatch[1];
          const relName = relMatch[2].trim();
          const relType = relMatch[3].trim();

          const deleteRuleMatch = relArgs.match(
            /deleteRule:\s*\.(\w+)/
          );

          relationships.push({
            name: relName,
            type: relType,
            ...(deleteRuleMatch ? { deleteRule: deleteRuleMatch[1] } : {}),
          });
        }

        models.push({ name: modelName, properties, relationships });
      }
    }

    return { models };
  } catch {
    return { models: [] };
  }
}

/** Check if a property in the chunk is preceded by @Relationship. */
function isRelationshipProperty(chunk: string, propName: string): boolean {
  // Look for @Relationship(...) right before var propName
  const relBeforeProp = new RegExp(
    `@Relationship\\([^)]*\\)\\s*\\n?\\s*var\\s+${propName}\\b`
  );
  return relBeforeProp.test(chunk);
}

// ---------------------------------------------------------------------------
// extractScreens
// ---------------------------------------------------------------------------

export function extractScreens(
  wireframesMarkdown: string,
  techStackMarkdown: string
): ScreensSpec {
  try {
    const screens: ScreensSpec['screens'] = [];

    // Pattern: **#N - Screen Name** or ### #N - Screen Name or **#N Screen Name**
    const screenPattern =
      /(?:\*\*#(\d+)\s*[-:]\s*(.+?)\*\*|###?\s*#(\d+)\s*[-:]\s*(.+?)(?:\n|$))/g;
    let screenMatch: RegExpExecArray | null;

    // Collect all screen start positions
    const screenPositions: Array<{
      num: string;
      name: string;
      startIdx: number;
    }> = [];

    while (
      (screenMatch = screenPattern.exec(wireframesMarkdown)) !== null
    ) {
      const num = screenMatch[1] || screenMatch[3];
      const name = (screenMatch[2] || screenMatch[4]).trim().replace(/\*+$/, '');
      screenPositions.push({
        num,
        name,
        startIdx: screenMatch.index,
      });
    }

    // Parse each screen section
    for (let i = 0; i < screenPositions.length; i++) {
      const pos = screenPositions[i];
      const endIdx =
        i + 1 < screenPositions.length
          ? screenPositions[i + 1].startIdx
          : wireframesMarkdown.length;

      const sectionText = wireframesMarkdown.slice(pos.startIdx, endIdx);

      // Determine type from explicit **Type:** or by inferring from name
      const typeMatch = sectionText.match(
        /\*\*Type:\*\*\s*(.+)/i
      );
      const screenType = typeMatch
        ? classifyScreenType(typeMatch[1].trim())
        : classifyScreenType(pos.name);

      // Extract purpose
      const purposeMatch = sectionText.match(
        /\*\*Purpose:\*\*\s*(.+)/i
      );
      const purpose = purposeMatch?.[1]?.trim() || '';

      // Extract elements from Key Elements or bullet lists
      const elements: string[] = [];
      const elemSection = sectionText.match(
        /\*\*Key Elements:\*\*([\s\S]*?)(?=\*\*(?:User Actions|Design Notes|Navigation)|$)/i
      );
      if (elemSection) {
        const bulletPattern = /[-*]\s+(.+)/g;
        let bullet: RegExpExecArray | null;
        while ((bullet = bulletPattern.exec(elemSection[1])) !== null) {
          elements.push(bullet[1].trim());
        }
      }

      // Extract navigatesTo from User Actions section
      const navigatesTo: string[] = [];
      const actionsSection = sectionText.match(
        /\*\*User Actions:\*\*([\s\S]*?)(?=\*\*(?:Design Notes|Key Elements)|#{1,4}\s|$)/i
      );
      if (actionsSection) {
        // Look for references to other screens: "navigates to #N", "goes to Screen Name", etc.
        const navPattern = /(?:navigates?\s+to|goes?\s+to|opens?|leads?\s+to)\s+(?:#(\d+)|([^,.\n]+))/gi;
        let navMatch: RegExpExecArray | null;
        while ((navMatch = navPattern.exec(actionsSection[1])) !== null) {
          const ref = navMatch[1]
            ? `screen_${navMatch[1]}`
            : navMatch[2].trim().toLowerCase().replace(/\s+/g, '_');
          navigatesTo.push(ref);
        }
      }

      screens.push({
        id: `screen_${pos.num}`,
        name: pos.name,
        type: screenType,
        purpose,
        elements,
        navigatesTo,
      });
    }

    // Detect navigation structure
    const navigationStructure = detectNavigationStructure(
      wireframesMarkdown,
      techStackMarkdown,
      screens
    );

    return { screens, navigationStructure };
  } catch {
    return {
      screens: [],
      navigationStructure: { rootType: 'tab' },
    };
  }
}

function classifyScreenType(text: string): string {
  const lower = text.toLowerCase();
  if (/onboarding|welcome|intro|walkthrough|get\s*started/i.test(lower))
    return 'onboarding';
  if (/auth|sign[\s-]?in|sign[\s-]?up|login|register|password/i.test(lower))
    return 'auth';
  if (/settings?|preferences?|account|profile/i.test(lower))
    return 'settings';
  if (/paywall|subscription|premium|pricing|upgrade/i.test(lower))
    return 'paywall';
  return 'main';
}

function detectNavigationStructure(
  wireframesMd: string,
  techStackMd: string,
  screens: ScreensSpec['screens']
): ScreensSpec['navigationStructure'] {
  const combined = wireframesMd + '\n' + techStackMd;

  // Look for TabView / tab references
  const hasTabView =
    /TabView|tab\s*bar|bottom\s*tabs?|tab\s*navigation/i.test(combined);
  const hasSidebar = /sidebar|split\s*view|NavigationSplitView/i.test(combined);

  if (hasSidebar) {
    return { rootType: 'sidebar' };
  }

  if (hasTabView) {
    // Try to extract tab definitions
    const tabs: Array<{ name: string; icon: string; screenId: string }> = [];

    // Pattern: tab name with SF Symbol: Home (house.fill) or | Home | house.fill |
    const tabPattern =
      /(?:\|\s*(\w[\w\s]*?)\s*\|\s*([\w.]+)\s*\|)|(?:(\w[\w\s]*?)\s*\(\s*([\w.]+)\s*\))/g;
    let tabMatch: RegExpExecArray | null;
    while ((tabMatch = tabPattern.exec(combined)) !== null) {
      const name = (tabMatch[1] || tabMatch[3])?.trim();
      const icon = (tabMatch[2] || tabMatch[4])?.trim();
      if (name && icon && icon.includes('.')) {
        // Likely an SF Symbol (contains a dot)
        const matchingScreen = screens.find(
          (s) =>
            s.name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(s.name.toLowerCase())
        );
        tabs.push({
          name,
          icon,
          screenId: matchingScreen?.id || `screen_${name.toLowerCase().replace(/\s+/g, '_')}`,
        });
      }
    }

    return { rootType: 'tab', ...(tabs.length > 0 ? { tabs } : {}) };
  }

  return { rootType: 'navigation_stack' };
}

// ---------------------------------------------------------------------------
// extractFeatures
// ---------------------------------------------------------------------------

export function extractFeatures(prdMarkdown: string): FeaturesSpec {
  try {
    const features: FeaturesSpec['features'] = [];

    // Strategy 1: Parse feature table rows
    // Pattern: | Feature Name | P0 | As a user... | Given/When/Then |
    const featureTablePattern =
      /\|\s*([^|]+?)\s*\|\s*(P[0-3])\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
    let tableMatch: RegExpExecArray | null;

    while ((tableMatch = featureTablePattern.exec(prdMarkdown)) !== null) {
      const name = tableMatch[1].trim();
      const priority = tableMatch[2].trim() as 'P0' | 'P1' | 'P2' | 'P3';
      const userStory = tableMatch[3].trim();
      const criteria = tableMatch[4].trim();

      // Skip table header rows
      if (
        name.toLowerCase() === 'feature' ||
        name.toLowerCase() === 'feature name' ||
        /^-+$/.test(name)
      ) {
        continue;
      }

      // Determine phase from surrounding context
      const phase = determinePhase(prdMarkdown, tableMatch.index, priority);

      // Parse acceptance criteria (may be semicolon or line-separated)
      const acceptanceCriteria = criteria
        .split(/[;\n]/)
        .map((c) => c.trim())
        .filter(Boolean);

      features.push({
        name,
        priority,
        phase,
        userStory,
        acceptanceCriteria,
      });
    }

    // Strategy 2: If no table rows found, try to extract from numbered/bulleted lists
    if (features.length === 0) {
      // Look for patterns like: **Feature Name** (P0) - description
      const listPattern =
        /\*\*([^*]+)\*\*\s*\(?(P[0-3])\)?\s*[-:]\s*(.+)/g;
      let listMatch: RegExpExecArray | null;

      while ((listMatch = listPattern.exec(prdMarkdown)) !== null) {
        const name = listMatch[1].trim();
        const priority = listMatch[2] as 'P0' | 'P1' | 'P2' | 'P3';
        const description = listMatch[3].trim();

        features.push({
          name,
          priority,
          phase: priority <= 'P1' ? 'mvp' : 'post_launch',
          userStory: description,
          acceptanceCriteria: [],
        });
      }
    }

    return { features };
  } catch {
    return { features: [] };
  }
}

/** Find the index of the last match of a pattern in a string. Returns -1 if not found. */
function lastMatchIndex(text: string, pattern: RegExp): number {
  let lastIdx = -1;
  let m: RegExpExecArray | null;
  // Ensure the regex has the global flag
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  while ((m = re.exec(text)) !== null) {
    lastIdx = m.index;
  }
  return lastIdx;
}

function determinePhase(
  markdown: string,
  position: number,
  priority: string
): 'mvp' | 'post_launch' | 'future' {
  // Search backwards from position for phase heading
  const preceding = markdown.slice(0, position);

  // Look for the most recent phase heading of each type
  const lastMvp = lastMatchIndex(
    preceding,
    /#{1,4}\s*(?:MVP|Phase\s*1|Core|Launch)\b/gi
  );
  const lastPostLaunch = lastMatchIndex(
    preceding,
    /#{1,4}\s*(?:Phase\s*2|Post[\s-]?Launch|Enhancement)/gi
  );
  const lastFuture = lastMatchIndex(
    preceding,
    /#{1,4}\s*(?:Phase\s*3|Future|Later|Backlog)/gi
  );

  const maxIdx = Math.max(lastMvp, lastPostLaunch, lastFuture);
  if (maxIdx === lastFuture && lastFuture >= 0) return 'future';
  if (maxIdx === lastPostLaunch && lastPostLaunch >= 0) return 'post_launch';
  if (maxIdx === lastMvp && lastMvp >= 0) return 'mvp';

  // Fall back to priority
  if (priority <= 'P1') return 'mvp';
  if (priority === 'P2') return 'post_launch';
  return 'future';
}

// ---------------------------------------------------------------------------
// extractAppConfig
// ---------------------------------------------------------------------------

export function extractAppConfig(
  appName: string,
  techStackMarkdown: string,
  xcodeSetupMarkdown: string | null,
  identityMarkdown: string
): AppConfigSpec {
  try {
    const combined = (techStackMarkdown || '') + '\n' + (xcodeSetupMarkdown || '');

    // Bundle ID
    const bundleIdMatch = combined.match(
      /(?:Bundle\s*(?:ID|Identifier))[:\s]*`?([a-z][a-z0-9.]*\.[a-z][a-z0-9]*)`?/i
    );
    const sanitizedName = appName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const bundleIdSuggestion =
      bundleIdMatch?.[1] || `com.yourcompany.${sanitizedName}`;

    // Min iOS
    const iosMatch = combined.match(
      /(?:iOS|IPHONEOS_DEPLOYMENT_TARGET)[:\s]*(\d+\.\d+)/i
    );
    const minIOS = iosMatch?.[1] || '17.0';

    // Swift version
    const swiftMatch = combined.match(
      /Swift\s*(\d+\.\d+)/i
    );
    const swiftVersion = swiftMatch?.[1] || '5.9';

    // Architecture
    const archMatch = combined.match(
      /Architecture[:\s|]*([^|\n]+)/i
    );
    const architecture =
      archMatch?.[1]?.trim().replace(/\*+/g, '') || 'MVVM + @Observable';

    // Entitlements
    const entitlements: string[] = [];
    const entitlementPatterns = [
      { pattern: /icloud|cloudkit/i, value: 'com.apple.developer.icloud-services' },
      { pattern: /sign\s*in\s*with\s*apple|applesignin/i, value: 'com.apple.developer.applesignin' },
      { pattern: /in-app\s*purchas|storekit/i, value: 'com.apple.developer.in-app-payments' },
      { pattern: /push\s*notif|aps-environment|APNs/i, value: 'aps-environment' },
      { pattern: /healthkit/i, value: 'com.apple.developer.healthkit' },
      { pattern: /homekit/i, value: 'com.apple.developer.homekit' },
      { pattern: /siri|app\s*intents/i, value: 'com.apple.developer.siri' },
    ];
    for (const ep of entitlementPatterns) {
      if (ep.pattern.test(combined)) {
        entitlements.push(ep.value);
      }
    }

    // Frameworks
    const frameworks: string[] = [];
    const frameworkPatterns = [
      'SwiftUI', 'SwiftData', 'CloudKit', 'StoreKit',
      'AuthenticationServices', 'MetricKit', 'UserNotifications',
      'AVFoundation', 'PhotosUI', 'CoreLocation', 'MapKit',
      'CoreML', 'Vision', 'NaturalLanguage', 'Speech',
      'CoreBluetooth', 'CoreMotion', 'CoreHaptics',
      'HealthKit', 'HomeKit', 'WeatherKit', 'WidgetKit',
      'ActivityKit', 'AppIntents', 'TipKit',
    ];
    for (const fw of frameworkPatterns) {
      if (new RegExp(`\\b${fw}\\b`, 'i').test(combined)) {
        frameworks.push(fw);
      }
    }
    // Always include base frameworks
    if (!frameworks.includes('SwiftUI')) frameworks.unshift('SwiftUI');
    if (!frameworks.includes('SwiftData')) frameworks.splice(1, 0, 'SwiftData');

    // Permissions
    const permissions: Array<{ key: string; description: string }> = [];
    const permissionPattern =
      /\|\s*(NS\w+UsageDescription)\s*\|\s*"?([^"|]+)"?\s*\|/g;
    let permMatch: RegExpExecArray | null;
    while ((permMatch = permissionPattern.exec(combined)) !== null) {
      permissions.push({
        key: permMatch[1].trim(),
        description: permMatch[2].trim(),
      });
    }

    return {
      appName,
      bundleIdSuggestion,
      minIOS,
      swiftVersion,
      architecture,
      entitlements,
      frameworks,
      permissions,
    };
  } catch {
    return {
      appName,
      bundleIdSuggestion: `com.yourcompany.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      minIOS: '17.0',
      swiftVersion: '5.9',
      architecture: 'MVVM + @Observable',
      entitlements: [],
      frameworks: ['SwiftUI', 'SwiftData'],
      permissions: [],
    };
  }
}
