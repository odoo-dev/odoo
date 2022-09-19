/** @odoo-module **/

import { isDark } from "@web/core/browser/feature_detection";

const COLORS_BRIGHT = [
    "#1f77b4",
    "#ff7f0e",
    "#aec7e8",
    "#ffbb78",
    "#2ca02c",
    "#98df8a",
    "#d62728",
    "#ff9896",
    "#9467bd",
    "#c5b0d5",
    "#8c564b",
    "#c49c94",
    "#e377c2",
    "#f7b6d2",
    "#7f7f7f",
    "#c7c7c7",
    "#bcbd22",
    "#dbdb8d",
    "#17becf",
    "#9edae5",
];

const COLORS_DARK = [
    "#00ffff",
    "#ff6347",
    "#00ced1",
    "#ffd700",
    "#29ef29",
    "#c5fabb",
    "#fe4b4c",
    "#ffb6c1",
    "#ba87e9",
    "#eadbf6",
    "#d36650",
    "#ecc1b8",
    "#fda9e3",
    "#ff69b4",
    "#808080",
    "#f2e8e8",
    "#fcfe2d",
    "#f8f8bc",
    "#33ecff",
    "#d3f6fc",
];

export const COLORS = isDark() ? COLORS_DARK : COLORS_BRIGHT;

/**
 * @param {number} index
 * @returns {string}
 */
export function getColor(index) {
    return COLORS[index % COLORS.length];
}

export const DEFAULT_BG = "#d3d3d3";

export const BORDER_WHITE = isDark() ? "rgba(0, 0, 0, 0.6)" : "rgba(255,255,255,0.6)";

const RGB_REGEX = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

/**
 * @param {string} hex
 * @param {number} opacity
 * @returns {string}
 */
export function hexToRGBA(hex, opacity) {
    const rgb = RGB_REGEX.exec(hex)
        .slice(1, 4)
        .map((n) => parseInt(n, 16))
        .join(",");
    return `rgba(${rgb},${opacity})`;
}
