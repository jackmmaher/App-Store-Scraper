import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getColorPalettesForDesignSystem, type ColorPalette } from '@/lib/crawl';

export const runtime = 'nodejs';

// POST /api/blueprint/palettes - Get color palettes for selection
export async function POST(request: NextRequest) {
  const authed = await isAuthenticated();
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { category, mood, max_palettes = 10, force_refresh = false } = body;

    // Get palettes from crawl service or fallback
    const promptText = await getColorPalettesForDesignSystem(
      category,
      mood,
      max_palettes
    );

    // Parse the prompt text to extract palettes
    const palettes = parsePalettesFromPromptText(promptText);

    return NextResponse.json({
      palettes,
      category,
      mood,
    });
  } catch (error) {
    console.error('Error fetching palettes:', error);

    // Return fallback palettes
    return NextResponse.json({
      palettes: getFallbackPalettes(),
      category: null,
      mood: null,
      fallback: true,
    });
  }
}

interface ParsedPalette {
  colors: string[];
  mood?: string;
  source_url?: string;
}

function parsePalettesFromPromptText(text: string): ParsedPalette[] {
  const palettes: ParsedPalette[] = [];

  // Match patterns like: **Palette 1** (mood): `#XXXXXX` | `#XXXXXX` | ...
  const palettePattern = /\*\*Palette \d+\*\*\s*\(([^)]+)\):\s*((?:`#[A-Fa-f0-9]{6}`\s*\|?\s*)+)/g;
  const hexPattern = /#([A-Fa-f0-9]{6})/g;

  let match;
  while ((match = palettePattern.exec(text)) !== null) {
    const mood = match[1].trim();
    const colorsStr = match[2];

    const colors: string[] = [];
    let hexMatch;
    while ((hexMatch = hexPattern.exec(colorsStr)) !== null) {
      colors.push(hexMatch[1].toUpperCase());
    }
    // Reset hex pattern for next palette
    hexPattern.lastIndex = 0;

    if (colors.length > 0) {
      palettes.push({ colors, mood });
    }
  }

  // If no palettes found with that pattern, try simpler pattern
  if (palettes.length === 0) {
    // Look for lines with multiple hex codes
    const lines = text.split('\n');
    for (const line of lines) {
      const colors: string[] = [];
      let hexMatch;
      const simpleHexPattern = /#([A-Fa-f0-9]{6})/g;
      while ((hexMatch = simpleHexPattern.exec(line)) !== null) {
        colors.push(hexMatch[1].toUpperCase());
      }
      if (colors.length >= 3) {
        // Try to extract mood from the line
        const moodMatch = line.match(/\(([a-z]+)\)/i);
        palettes.push({
          colors,
          mood: moodMatch ? moodMatch[1] : undefined,
        });
      }
    }
  }

  return palettes;
}

function getFallbackPalettes(): ParsedPalette[] {
  return [
    { colors: ['264653', '2A9D8F', 'E9C46A', 'F4A261', 'E76F51'], mood: 'professional' },
    { colors: ['003049', 'D62828', 'F77F00', 'FCBF49', 'EAE2B7'], mood: 'bold' },
    { colors: ['1D3557', '457B9D', 'A8DADC', 'F1FAEE', 'E63946'], mood: 'professional' },
    { colors: ['606C38', '283618', 'FEFAE0', 'DDA15E', 'BC6C25'], mood: 'calm' },
    { colors: ['CCD5AE', 'E9EDC9', 'FEFAE0', 'FAEDCD', 'D4A373'], mood: 'calm' },
    { colors: ['0D1B2A', '1B263B', '415A77', '778DA9', 'E0E1DD'], mood: 'dark' },
    { colors: ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7'], mood: 'playful' },
    { colors: ['F72585', 'B5179E', '7209B7', '560BAD', '480CA8'], mood: 'bold' },
    { colors: ['03045E', '0077B6', '00B4D8', '90E0EF', 'CAF0F8'], mood: 'cool' },
    { colors: ['FFBE0B', 'FB5607', 'FF006E', '8338EC', '3A86FF'], mood: 'playful' },
  ];
}
