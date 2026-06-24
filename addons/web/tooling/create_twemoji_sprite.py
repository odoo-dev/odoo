import logging
import math
import re
import shutil
from pathlib import Path

from PIL import Image
from resvg_py import svg_to_bytes

STATIC_DIR = Path(__file__).parent.parent / "static"
logger = logging.getLogger(__name__)

TILE_SIZE = 52  # final emoji render size
PADDING = 1  # anti-bleed padding
CELL_SIZE = TILE_SIZE + 2 * PADDING  # 54
COLUMNS = 42  # emojis per row
SVG_DIR = STATIC_DIR / "img/twemoji/svg"
PNG_DIR = STATIC_DIR / "img/twemoji/52x52_RESVG"
OUTPUT_IMAGE = STATIC_DIR / "img/twemoji_sprite.png"


def emoji_to_hex(emoji: str) -> str:
    if emoji == "👁️‍🗨️":
        return "1f441-200d-1f5e8"

    # Remove variant selector if emoji doesn't contain a ZWJ
    if "\u200d" not in emoji:
        emoji = emoji.replace("\ufe0f", "")
    return "-".join(f"{ord(c):x}" for c in emoji)


def render_svg(svg_path: Path, png_path: Path, size=80):
    png_bytes = svg_to_bytes(svg_path=str(svg_path), width=size, height=size, background="transparent")
    with open(png_path, "wb") as f:
        f.write(png_bytes)

    png = Image.open(png_path)
    if png.size != (size, size):
        logger.warning("Converted emoji PNG size mismatch for %s: expected %dx%d, got %s", svg_path, size, size, png.size)
        x = (size - png.width) // 2
        y = (size - png.height) // 2
        final_img = Image.new("RGBA", (size, size))
        final_img.paste(png, (x, y))
        final_img.save(png_path)
        logger.info("Adjusted size for %s: %s", png_path, final_img.size)


def prepare_pngs():
    PNG_DIR.mkdir(parents=True, exist_ok=True)

    png_files_by_hex = {}

    for svg_file in SVG_DIR.glob("*.svg"):
        hexcode = svg_file.stem
        png_path = PNG_DIR / f"{hexcode}.png"

        render_svg(svg_file, png_path, TILE_SIZE)
        png_files_by_hex[hexcode] = png_path

    return png_files_by_hex


def create_sprite_bundle():
    png_files_by_hex = prepare_pngs()
    emoji_data = STATIC_DIR / "src/core/emoji_picker/emoji_data.js"
    new_lines = []
    positions = {}
    emojis = []
    with open(emoji_data, encoding="utf-8") as f:
        for line in f.read().splitlines():
            if line.lstrip().startswith(('"hexcode"', '"p_x"', '"p_y"')):
                continue
            new_lines.append(line)
            match = re.search(r'^(\s*)"(?:codepoints|title)"\s*:\s*"([^"]+)"', line)
            if match:
                emoji = match.group(2)
                hexcode = emoji_to_hex(emoji)
                emojis.append((emoji, hexcode))

    rows = math.ceil(len(emojis) / COLUMNS)
    sheet_width = COLUMNS * CELL_SIZE
    sheet_height = rows * CELL_SIZE
    sprite_sheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
    for idx, (emoji, hexcode) in enumerate(emojis):
        col = idx % COLUMNS
        row = idx // COLUMNS

        x = col * CELL_SIZE + PADDING
        y = row * CELL_SIZE + PADDING

        if hexcode not in png_files_by_hex:
            logger.warning("Missing SVG/PNG for %s (%s)", emoji, hexcode)
            continue

        img = Image.open(png_files_by_hex[hexcode]).convert("RGBA")

        if img.size != (TILE_SIZE, TILE_SIZE):
            raise ValueError(f"{hexcode} is not {TILE_SIZE}x{TILE_SIZE}, got {img.size}")

        sprite_sheet.paste(img, (x, y))

        positions[emoji] = {"p_x": x, "p_y": y, "hexcode": hexcode}

    updated_lines = []
    for line in new_lines:
        updated_lines.append(line)

        match = re.search(r'^(\s*)"(?:codepoints|title)"\s*:\s*"([^"]+)"', line)
        if match:
            indent = match.group(1)
            emoji = match.group(2)

            if emoji in positions:
                pos = positions[emoji]
                updated_lines.append(f'{indent}"hexcode": "{pos["hexcode"]}",')
                updated_lines.append(f'{indent}"p_x": {pos["p_x"]},')
                updated_lines.append(f'{indent}"p_y": {pos["p_y"]},')

    with open(emoji_data, "w", encoding="utf-8") as f:
        f.write("\n".join(updated_lines))

    sprite_sheet.save(OUTPUT_IMAGE)
    # Clean up generated PNGs directory (may contain files)
    try:
        shutil.rmtree(PNG_DIR)
    except Exception:
        logger.warning("Failed to remove PNG temp directory: %s", PNG_DIR)
    width, height = sprite_sheet.size
    logger.info("Created sprite: %s (%d emojis) - size: %dx%d", OUTPUT_IMAGE, len(emojis), width, height)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    create_sprite_bundle()
