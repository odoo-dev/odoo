import { darkenColor, lightenColor } from "@web/core/colors/colors";

function getLuminance(color) {
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Picks a readable text color (black or white) for a given background color,
 * based on its perceived brightness.
 *
 * @param {string} color
 * @returns {string}
 */
export function getContrastColor(color) {
    return getLuminance(color) > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Darkens a color used as text/border on a plain surface (outline button,
 * link, @mention) so it stays readable, capping its luminance at
 * targetLuminance. Left as-is if already darker than that.
 * @param {string} color
 * @param {number} [targetLuminance]
 * @returns {string}
 */
export function getReadableColor(color, targetLuminance = 0.3) {
    const luminance = getLuminance(color);
    if (luminance <= targetLuminance) {
        return color;
    }
    return darkenColor(color, 1 - targetLuminance / luminance);
}

/**
 * Same idea as getReadableColor, but two-way: brings a color to
 * targetLuminance regardless of whether it started darker or lighter than
 * that, instead of only ever capping it from above. Meant for a color that
 * has to stay visible against a fixed-lightness surface either way, e.g. a
 * bubble border that shouldn't disappear on a light base color nor
 * overwhelm a dark one.
 *
 * @param {string} color
 * @param {number} [targetLuminance]
 * @returns {string}
 */
export function getNormalizedColor(color, targetLuminance = 0.5) {
    const luminance = getLuminance(color);
    if (luminance > targetLuminance) {
        return darkenColor(color, 1 - targetLuminance / luminance);
    }
    if (luminance < targetLuminance) {
        return lightenColor(color, (targetLuminance - luminance) / (1 - luminance));
    }
    return color;
}
