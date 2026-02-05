"""
UIColors Spectrum Generator - Generates color shade spectrums

Uses color theory to generate a full shade spectrum from a single primary color.
Inspired by uicolors.app but implemented locally for speed and reliability.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


def hex_to_hsl(hex_color: str) -> Tuple[float, float, float]:
    """Convert hex color to HSL (Hue, Saturation, Lightness)"""
    hex_color = hex_color.lstrip('#')
    if not re.match(r'^[0-9A-Fa-f]{6}$', hex_color):
        raise ValueError(f"Invalid hex color: {hex_color}")
    r, g, b = tuple(int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))

    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l = (max_c + min_c) / 2

    if max_c == min_c:
        h = s = 0
    else:
        d = max_c - min_c
        s = d / (2 - max_c - min_c) if l > 0.5 else d / (max_c + min_c)

        if max_c == r:
            h = ((g - b) / d + (6 if g < b else 0)) / 6
        elif max_c == g:
            h = ((b - r) / d + 2) / 6
        else:
            h = ((r - g) / d + 4) / 6

    return h * 360, s * 100, l * 100


def hsl_to_hex(h: float, s: float, l: float) -> str:
    """Convert HSL to hex color"""
    h = h / 360
    s = s / 100
    l = l / 100

    if s == 0:
        r = g = b = l
    else:
        def hue_to_rgb(p, q, t):
            if t < 0:
                t += 1
            if t > 1:
                t -= 1
            if t < 1/6:
                return p + (q - p) * 6 * t
            if t < 1/2:
                return q
            if t < 2/3:
                return p + (q - p) * (2/3 - t) * 6
            return p

        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q

        r = hue_to_rgb(p, q, h + 1/3)
        g = hue_to_rgb(p, q, h)
        b = hue_to_rgb(p, q, h - 1/3)

    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}".upper()


def generate_shade_spectrum(
    primary_hex: str,
    shades: List[int] = None,
) -> Dict[str, str]:
    """
    Generate a full shade spectrum from a primary color.

    Args:
        primary_hex: Primary color in hex format (with or without #)
        shades: List of shade numbers (default: 50, 100, 200, ..., 900, 950)

    Returns:
        Dictionary mapping shade number to hex color
    """
    primary_hex = primary_hex.lstrip('#').upper()

    # Default Tailwind-style shades
    if shades is None:
        shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

    # Convert primary to HSL
    h, s, l = hex_to_hsl(primary_hex)

    # Find which shade the primary color best matches
    # (usually around 500-600 for "normal" colors)
    primary_shade = 500
    for shade in shades:
        if shade >= 400 and shade <= 600:
            primary_shade = shade
            break

    # Calculate lightness for each shade
    # 50 = very light (~95% lightness), 950 = very dark (~5% lightness)
    spectrum = {}

    for shade in shades:
        if shade == primary_shade:
            spectrum[str(shade)] = f"#{primary_hex}"
        else:
            # Linear interpolation of lightness
            if shade < primary_shade:
                # Lighter shades
                ratio = (primary_shade - shade) / primary_shade
                new_l = l + (95 - l) * ratio
            else:
                # Darker shades
                ratio = (shade - primary_shade) / (950 - primary_shade)
                new_l = l - (l - 5) * ratio

            # Slightly desaturate at extremes
            new_s = s
            if shade <= 100:
                new_s = s * 0.7
            elif shade >= 800:
                new_s = s * 0.8

            spectrum[str(shade)] = hsl_to_hex(h, new_s, new_l)

    return spectrum


def generate_semantic_colors(primary_hex: str) -> Dict[str, str]:
    """
    Generate semantic colors (success, warning, error, info) that complement the primary.

    Args:
        primary_hex: Primary color in hex format

    Returns:
        Dictionary with semantic color hex codes
    """
    primary_hex = primary_hex.lstrip('#')
    h, s, l = hex_to_hsl(primary_hex)

    # Standard semantic colors with slight hue shifts to complement primary
    # Green for success
    success_h = 142  # Green
    success = hsl_to_hex(success_h, 70, 45)

    # Yellow/Orange for warning
    warning_h = 38  # Orange-yellow
    warning = hsl_to_hex(warning_h, 90, 50)

    # Red for error
    error_h = 0  # Red
    error = hsl_to_hex(error_h, 75, 55)

    # Blue for info (avoid if primary is blue)
    if 180 < h < 260:  # Primary is blue-ish
        info_h = 200  # Cyan-blue
    else:
        info_h = 217  # Standard blue
    info = hsl_to_hex(info_h, 80, 50)

    return {
        "success": success,
        "warning": warning,
        "error": error,
        "info": info,
    }


def generate_color_system(primary_hex: str) -> Dict[str, Any]:
    """
    Generate a complete color system from a primary color.

    Args:
        primary_hex: Primary color in hex format

    Returns:
        Complete color system with shades and semantic colors
    """
    primary_hex = primary_hex.lstrip('#').upper()

    return {
        "primary": {
            "hex": f"#{primary_hex}",
            "shades": generate_shade_spectrum(primary_hex),
        },
        "semantic": generate_semantic_colors(primary_hex),
    }


def generate_complementary_colors(primary_hex: str) -> Dict[str, str]:
    """
    Generate complementary and analogous colors.

    Args:
        primary_hex: Primary color in hex format

    Returns:
        Dictionary with related colors
    """
    primary_hex = primary_hex.lstrip('#')
    h, s, l = hex_to_hsl(primary_hex)

    # Complementary (opposite on color wheel)
    complementary_h = (h + 180) % 360

    # Analogous (adjacent on color wheel)
    analogous1_h = (h + 30) % 360
    analogous2_h = (h - 30) % 360

    # Triadic (120 degrees apart)
    triadic1_h = (h + 120) % 360
    triadic2_h = (h + 240) % 360

    return {
        "complementary": hsl_to_hex(complementary_h, s, l),
        "analogous1": hsl_to_hex(analogous1_h, s, l),
        "analogous2": hsl_to_hex(analogous2_h, s, l),
        "triadic1": hsl_to_hex(triadic1_h, s, l),
        "triadic2": hsl_to_hex(triadic2_h, s, l),
    }


def format_color_system_for_prompt(color_system: Dict) -> str:
    """
    Format color system for inclusion in an AI prompt.

    Args:
        color_system: Color system from generate_color_system()

    Returns:
        Markdown-formatted string
    """
    lines = ["## Generated Color Spectrum", ""]

    # Primary shades
    lines.append("### Primary Color Shades")
    lines.append(f"Base Color: `{color_system['primary']['hex']}`")
    lines.append("")

    shades = color_system['primary']['shades']
    shade_line = " | ".join([f"{k}: `{v}`" for k, v in sorted(shades.items(), key=lambda x: int(x[0]))])
    lines.append(shade_line)
    lines.append("")

    # Semantic colors
    lines.append("### Semantic Colors")
    semantic = color_system['semantic']
    lines.append(f"- Success: `{semantic['success']}`")
    lines.append(f"- Warning: `{semantic['warning']}`")
    lines.append(f"- Error: `{semantic['error']}`")
    lines.append(f"- Info: `{semantic['info']}`")
    lines.append("")

    return "\n".join(lines)
