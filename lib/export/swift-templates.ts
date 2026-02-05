/**
 * swift-templates.ts
 *
 * Generates Swift source files from extracted spec objects.
 */

import type { DesignTokensSpec, DataModelsSpec, AppConfigSpec } from './spec-generators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a colour key like "secondaryBackground" to a Swift-friendly name. */
function colorSwiftName(key: string): string {
  // Map of special names
  const nameMap: Record<string, string> = {
    primary: 'Primary',
    secondary: 'Secondary',
    accent: 'Accent',
    background: 'Background',
    secondaryBackground: 'SecondaryBackground',
    text: 'TextPrimary',
    secondaryText: 'TextSecondary',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    info: 'Info',
  };
  return nameMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/** Convert a colour key to a Swift static property name (camelCase). */
function colorPropertyName(key: string): string {
  const nameMap: Record<string, string> = {
    primary: 'appPrimary',
    secondary: 'appSecondary',
    accent: 'appAccent',
    background: 'appBackground',
    secondaryBackground: 'appSecondaryBackground',
    text: 'appText',
    secondaryText: 'appSecondaryText',
    success: 'appSuccess',
    warning: 'appWarning',
    error: 'appError',
    info: 'appInfo',
  };
  return nameMap[key] || `app${key.charAt(0).toUpperCase() + key.slice(1)}`;
}

/** Map a typography weight string to a Swift Font.Weight case. */
function swiftWeight(weight: string): string {
  const w = weight.toLowerCase().trim();
  const map: Record<string, string> = {
    ultralight: '.ultraLight',
    thin: '.thin',
    light: '.light',
    regular: '.regular',
    medium: '.medium',
    semibold: '.semibold',
    bold: '.bold',
    heavy: '.heavy',
    black: '.black',
  };
  return map[w] || '.regular';
}

/** Sanitise an app name for use as a Swift identifier (no spaces, special chars). */
function swiftIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// generateDesignTokensSwift
// ---------------------------------------------------------------------------

export function generateDesignTokensSwift(
  tokens: DesignTokensSpec,
  appName: string
): string {
  const lines: string[] = [];

  lines.push('//');
  lines.push(`//  DesignTokens.swift`);
  lines.push(`//  ${appName}`);
  lines.push('//');
  lines.push(`//  Auto-generated from design specs. Do not edit manually.`);
  lines.push('//');
  lines.push('');
  lines.push('import SwiftUI');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Colors
  // -----------------------------------------------------------------------
  lines.push('// MARK: - Colors');
  lines.push('');
  lines.push('extension Color {');

  const colorKeys = Object.keys(tokens.colors) as Array<
    keyof DesignTokensSpec['colors']
  >;
  for (const key of colorKeys) {
    const assetName = colorSwiftName(key);
    const propName = colorPropertyName(key);
    lines.push(
      `    static let ${propName} = Color("${assetName}")`
    );
  }

  lines.push('}');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Spacing
  // -----------------------------------------------------------------------
  lines.push('// MARK: - Spacing');
  lines.push('');
  lines.push('enum Spacing {');

  for (const [key, value] of Object.entries(tokens.spacing)) {
    // Sanitise key for Swift: replace dashes, ensure starts with letter
    const safeKey = key.replace(/-/g, '_').replace(/^(\d)/, '_$1');
    lines.push(`    static let ${safeKey}: CGFloat = ${value}`);
  }

  lines.push('}');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Corner Radius
  // -----------------------------------------------------------------------
  lines.push('// MARK: - CornerRadius');
  lines.push('');
  lines.push('enum CornerRadius {');

  for (const [key, value] of Object.entries(tokens.cornerRadius)) {
    const safeKey = key.replace(/-/g, '_').replace(/^(\d)/, '_$1');
    lines.push(`    static let ${safeKey}: CGFloat = ${value}`);
  }

  lines.push('}');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Shadows
  // -----------------------------------------------------------------------
  lines.push('// MARK: - Shadows');
  lines.push('');
  lines.push('enum AppShadow {');

  for (const shadow of tokens.shadows) {
    const safeName = shadow.name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^(\d)/, '_$1');

    if (shadow.value === 'none' || shadow.value === 'None') {
      lines.push(
        `    static let ${safeName} = ShadowStyle.drop(color: .clear, radius: 0)`
      );
    } else {
      // Parse shadow value: "0 Npx Mpx rgba(r,g,b,a)"
      const shadowParts = shadow.value.match(
        /(\d+)\s*(?:px|pt)?\s+(\d+)\s*(?:px|pt)?\s+rgba?\([\d.,\s]+\)/
      );
      const radius = shadowParts ? parseInt(shadowParts[2], 10) : 4;
      const opacity = shadow.value.match(/[\d.]+\s*\)$/)?.[0]?.replace(')', '') || '0.1';
      lines.push(
        `    static let ${safeName} = ShadowStyle.drop(color: .black.opacity(${opacity}), radius: ${radius})`
      );
    }
  }

  lines.push('}');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Typography
  // -----------------------------------------------------------------------
  lines.push('// MARK: - Typography');
  lines.push('');
  lines.push('enum AppTypography {');

  for (const entry of tokens.typography.scale) {
    const safeName = entry.name
      .replace(/\s+/g, '')
      .replace(/^(.)/, (c) => c.toLowerCase());
    const weight = swiftWeight(entry.weight);
    lines.push(
      `    /// ${entry.usage} (${entry.size}pt ${entry.weight})`
    );
    lines.push(
      `    static let ${safeName} = Font.system(size: ${entry.size}, weight: ${weight})`
    );
  }

  lines.push('}');
  lines.push('');

  // -----------------------------------------------------------------------
  // MARK: - Font Extension
  // -----------------------------------------------------------------------
  lines.push('// MARK: - Font Extension');
  lines.push('');
  lines.push('extension Font {');
  lines.push(`    static let appLargeTitle = Font.largeTitle.weight(.bold)`);
  lines.push(`    static let appTitle1 = Font.title.weight(.bold)`);
  lines.push(`    static let appTitle2 = Font.title2.weight(.bold)`);
  lines.push(`    static let appTitle3 = Font.title3.weight(.semibold)`);
  lines.push(`    static let appHeadline = Font.headline`);
  lines.push(`    static let appBody = Font.body`);
  lines.push(`    static let appCallout = Font.callout`);
  lines.push(`    static let appSubheadline = Font.subheadline`);
  lines.push(`    static let appFootnote = Font.footnote`);
  lines.push(`    static let appCaption = Font.caption`);
  lines.push(`    static let appCaption2 = Font.caption2`);
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// generateAppEntrySwift
// ---------------------------------------------------------------------------

export function generateAppEntrySwift(
  appName: string,
  config: AppConfigSpec,
  models: DataModelsSpec
): string {
  const identifier = swiftIdentifier(appName);
  const lines: string[] = [];

  lines.push('//');
  lines.push(`//  ${identifier}App.swift`);
  lines.push(`//  ${appName}`);
  lines.push('//');
  lines.push(`//  Auto-generated app entry point.`);
  lines.push('//');
  lines.push('');
  lines.push('import SwiftUI');
  lines.push('import SwiftData');

  // Add extra framework imports based on config
  const extraImports = config.frameworks.filter(
    (fw) => fw !== 'SwiftUI' && fw !== 'SwiftData'
  );
  for (const fw of extraImports) {
    lines.push(`import ${fw}`);
  }

  lines.push('');
  lines.push('@main');
  lines.push(`struct ${identifier}App: App {`);

  // Model list
  const modelNames =
    models.models.length > 0
      ? models.models.map((m) => `${m.name}.self`)
      : ['/* Add your @Model types here */'];

  const modelListStr = modelNames.join(', ');

  // Determine if CloudKit is configured
  const hasCloudKit = config.entitlements.some((e) =>
    e.includes('icloud')
  );
  const bundleId = config.bundleIdSuggestion;

  lines.push('');
  lines.push('    var body: some Scene {');
  lines.push('        WindowGroup {');
  lines.push('            ContentView()');
  lines.push('        }');

  if (hasCloudKit) {
    lines.push(`        .modelContainer(`);
    lines.push(`            for: [${modelListStr}],`);
    lines.push(`            inMemory: false,`);
    lines.push(`            isAutosaveEnabled: true,`);
    lines.push(`            isUndoEnabled: true`);
    lines.push(`        )`);
  } else {
    lines.push(`        .modelContainer(for: [${modelListStr}])`);
  }

  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}
