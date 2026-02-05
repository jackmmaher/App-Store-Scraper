/**
 * claude-md-generator.ts
 *
 * Generates the CLAUDE.md entry-point file for the exported project package.
 * This file instructs an AI coding assistant how to build the iOS app from
 * the accompanying spec files and build manifest.
 */

import type { AppConfigSpec } from './spec-generators';

/**
 * Generate CLAUDE.md content.
 *
 * @param appName      - The chosen app name
 * @param prdSummary   - First paragraph of the PRD (executive summary)
 * @param config       - Extracted AppConfigSpec
 * @param featureCount - Total number of features extracted
 * @param screenCount  - Total number of screens extracted
 */
export function generateClaudeMd(
  appName: string,
  prdSummary: string,
  config: AppConfigSpec,
  featureCount: number,
  screenCount: number
): string {
  const summary = prdSummary.trim() || `${appName} is a native iOS application.`;

  return `# ${appName}

${summary}

## Architecture

- **Platform:** iOS ${config.minIOS}+ only
- **Language:** Swift ${config.swiftVersion}
- **UI:** SwiftUI (declarative, no UIKit unless unavoidable)
- **Architecture:** ${config.architecture}
- **Data:** SwiftData for persistence, CloudKit for sync
- **Payments:** StoreKit 2 with SubscriptionStoreView
- **Auth:** Sign in with Apple
- **Dependencies:** ZERO third-party packages. Apple frameworks only.

## How to Use This Package

1. Read \`specs/app-config.json\` for project setup
2. Read \`specs/design-tokens.json\` and generate/update \`Theme/DesignTokens.swift\`
3. Read \`specs/data-models.json\` and create all SwiftData @Model files
4. Read \`BUILD_MANIFEST.md\` and execute tasks sequentially
5. Update \`PROGRESS.md\` after completing each task

## Spec Files (Read These First)

| File | Contains |
|------|----------|
| \`specs/app-config.json\` | Bundle ID, min iOS, entitlements, frameworks, permissions |
| \`specs/design-tokens.json\` | Colors (light/dark), spacing, radii, shadows, typography |
| \`specs/data-models.json\` | SwiftData @Model definitions with properties and relationships |
| \`specs/screens.json\` | Navigation graph + ${screenCount} screen definitions |
| \`specs/features.json\` | ${featureCount} features with priority and acceptance criteria |
| \`specs/pain-points.json\` | User pain points from competitor research (build solutions for these) |
| \`specs/feature-matrix.json\` | Competitive feature comparison (exploit gaps) |

## Rules

1. **Apple frameworks ONLY** — no SPM packages, no CocoaPods, no third-party code
2. **Use DesignTokens.swift** for ALL colors, spacing, and corner radii — never hardcode values
3. **Use Asset Catalog colors** — reference via \`Color("Primary")\`, \`Color("Accent")\`, etc.
4. **Follow specs/** — the JSON files are the source of truth, not the markdown in blueprint/
5. **Update PROGRESS.md** — check off tasks as you complete them
6. **One file per task** — each BUILD_MANIFEST task produces exactly one file or change
7. **Test incrementally** — project should build after every task

## Reference Docs

The \`blueprint/\` folder contains human-readable context:
- \`01-strategy.md\` — Market analysis and competitive positioning
- \`02-identity.md\` — App name, icon direction, brand identity
- \`03-design-system.md\` — Full design system (detailed version of design-tokens.json)
- \`04-wireframes.md\` — Screen-by-screen UI specifications
- \`05-prd.md\` — Complete product requirements document
- \`06-aso.md\` — App Store Optimization (title, keywords, description)

Read these for context. Execute from \`BUILD_MANIFEST.md\`.
`;
}
