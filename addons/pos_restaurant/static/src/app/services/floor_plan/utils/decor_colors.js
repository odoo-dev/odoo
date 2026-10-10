import { markRaw, proxy } from "@odoo/owl";
import { STATIC_IMG_BASE_URL } from "./utils";

export const DECOR_COLORS = {
    wood: "#c9b08f",
    wood2: "#a88f72",
    wood3: "#ddcbb0",
    fabric: "#cdb79b",
    fabric2: "#a88f72",
    metal: "#c3c7cb",
    metal2: "#8e9397",
    green: "#9dba88",
    green2: "#789a66",
    accent: "#d4916a",
    cream: "#f3e9d6",
    dark: "#3a3a3a",
    stone: "#ddd6c9",
    line: "#4a3b33",
    picto: "#000000",
    sign: "#5c5c5c",
};

export function getStaticSvgUrl(name) {
    return /^[\w-]+\.svg$/.test(name || "") ? `${STATIC_IMG_BASE_URL}/${name}` : null;
}

const svgAssets = proxy({});
const svgAssetLoading = new Map();
const TOKEN_RE = /--fp-([a-z0-9]+)/g;
const COLOR_VAR_RE = /var\(--fp-([a-z0-9]+)(?:,\s*([^)]*))?\)/g;
const MAX_IMAGES_PER_SVG = 20;
const svgImageUrls = new WeakMap();

function parseSvgAsset(text) {
    if (!text.includes("<svg")) {
        return null;
    }
    const tokens = [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[1]))];
    return markRaw({ text, tokens });
}

/**
 * Decor SVG files take their colors from CSS variables, like var(--fp-wood).
 * As for website image shapes, the colors are written into the SVG text and
 * the result is used as a background image, which cannot run any script.
 * The URL only depends on the file and the colors, and is cached.
 */
export function getSvgImageUrl(asset, getColor) {
    const colors = Object.fromEntries(asset.tokens.map((token) => [token, getColor(token)]));
    const key = asset.tokens.map((token) => colors[token]).join(",");
    let urls = svgImageUrls.get(asset);
    if (!urls) {
        urls = new Map();
        svgImageUrls.set(asset, urls);
    }
    if (!urls.has(key)) {
        if (urls.size >= MAX_IMAGES_PER_SVG) {
            urls.delete(urls.keys().next().value);
        }
        const text = asset.text.replace(
            COLOR_VAR_RE,
            (match, token, fallback) => colors[token] || fallback || "currentColor"
        );
        urls.set(key, `data:image/svg+xml,${encodeURIComponent(text)}`);
    }
    return urls.get(key);
}

export function getSvgAsset(url) {
    const asset = svgAssets[url];
    if (asset === undefined) {
        loadSvgAsset(url);
    }
    return asset || null;
}

export function loadSvgAsset(url) {
    if (svgAssets[url] !== undefined) {
        return Promise.resolve(svgAssets[url]);
    }
    if (!svgAssetLoading.has(url)) {
        const promise = fetch(url)
            .then((response) => (response.ok ? response.text() : null))
            .then((text) => {
                const asset = text ? parseSvgAsset(text) : null;
                svgAssets[url] = asset;
                return asset;
            })
            .catch(() => {
                svgAssets[url] = null;
                return null;
            })
            .finally(() => svgAssetLoading.delete(url));
        svgAssetLoading.set(url, promise);
    }
    return svgAssetLoading.get(url);
}
