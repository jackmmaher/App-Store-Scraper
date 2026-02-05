/**
 * asset-catalog-generator.ts
 *
 * Generates Xcode Asset Catalog color files from a DesignTokensSpec.
 * Each colour pair (light/dark) produces a .colorset/Contents.json file
 * following Apple's asset catalog format.
 */

import type { DesignTokensSpec } from './spec-generators';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorAsset {
  /** Relative path inside the asset catalog, e.g. "Colors/Primary.colorset/Contents.json" */
  path: string;
  /** JSON string in Apple's colorset format */
  contents: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a hex colour string to sRGB decimal components (0-1 range, 3 decimal places).
 *
 * Accepts formats: "#264653", "264653", "#ABC", "ABC"
 */
function hexToComponents(hex: string): {
  red: string;
  green: string;
  blue: string;
} {
  let cleaned = hex.trim().replace(/^#/, '');

  // Expand 3-char shorthand
  if (cleaned.length === 3) {
    cleaned =
      cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
  }

  // Default to black on invalid input
  if (cleaned.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return { red: '0.000', green: '0.000', blue: '0.000' };
  }

  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;

  return {
    red: r.toFixed(3),
    green: g.toFixed(3),
    blue: b.toFixed(3),
  };
}

/** Map a color key to a human-readable asset catalog folder name. */
function colorAssetName(key: string): string {
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

/**
 * Build the Contents.json payload for a single colorset with light + dark variants.
 */
function buildColorSetJson(lightHex: string, darkHex: string): string {
  const light = hexToComponents(lightHex);
  const dark = hexToComponents(darkHex);

  const payload = {
    colors: [
      {
        color: {
          'color-space': 'srgb',
          components: {
            red: light.red,
            green: light.green,
            blue: light.blue,
            alpha: '1.000',
          },
        },
        idiom: 'universal',
      },
      {
        appearances: [
          {
            appearance: 'luminosity',
            value: 'dark',
          },
        ],
        color: {
          'color-space': 'srgb',
          components: {
            red: dark.red,
            green: dark.green,
            blue: dark.blue,
            alpha: '1.000',
          },
        },
        idiom: 'universal',
      },
    ],
    info: {
      author: 'xcode',
      version: 1,
    },
  };

  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an array of ColorAsset objects (path + Contents.json) from the
 * design tokens colour palette.
 *
 * Produces one .colorset per colour token, placed under a "Colors/" folder.
 * Also produces a root Contents.json for the Colors folder (required by Xcode).
 */
export function generateColorAssets(tokens: DesignTokensSpec): ColorAsset[] {
  const assets: ColorAsset[] = [];

  // Root Contents.json for the Colors namespace folder
  assets.push({
    path: 'Colors/Contents.json',
    contents: JSON.stringify(
      {
        info: {
          author: 'xcode',
          version: 1,
        },
      },
      null,
      2
    ),
  });

  // Generate a colorset for each token
  const colorKeys = Object.keys(tokens.colors) as Array<
    keyof DesignTokensSpec['colors']
  >;

  for (const key of colorKeys) {
    const pair = tokens.colors[key];
    const name = colorAssetName(key);
    const json = buildColorSetJson(pair.light, pair.dark);

    assets.push({
      path: `Colors/${name}.colorset/Contents.json`,
      contents: json,
    });
  }

  return assets;
}

// Re-export hexToComponents for testing
export { hexToComponents };
