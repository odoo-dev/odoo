import { markup } from "@odoo/owl";
import { get } from "@web/core/network/http_service";

/**
 * Loads an svg file and returns its content as markup, ready to be inlined with
 * a `t-out`. Inlining the svg (instead of pointing an `<img>` at it) is what
 * allows it to be styled along with its surroundings: `currentColor`, hover
 * states, `color-scheme`, ...
 *
 * The static file handler serves the files with a cache, so this hits the
 * network only the first time a given svg is displayed.
 */

const FORBIDDEN_TAGS = new Set(["script", "foreignobject", "iframe", "image", "audio", "video"]);

/**
 * Removes everything that could execute code or fetch an external resource.
 *
 * @param {SVGElement} svg
 */
function sanitizeSvg(svg) {
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
        if (FORBIDDEN_TAGS.has(el.nodeName.toLowerCase())) {
            el.remove();
            continue;
        }
        for (const { name, value } of [...el.attributes]) {
            const isEventHandler = name.toLowerCase().startsWith("on");
            const isExternalRef = /(^|:)href$/i.test(name) && !value.trim().startsWith("#");
            if (isEventHandler || isExternalRef) {
                el.removeAttribute(name);
            }
        }
    }
}

/**
 * @param {string} content
 * @returns {ReturnType<markup>|null} null if `content` isn't a usable svg
 */
function parseSvg(content) {
    const doc = new DOMParser().parseFromString(content, "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
        return null;
    }
    sanitizeSvg(svg);
    // markup: everything that could be executed or fetched has been removed
    return markup(svg.outerHTML);
}

/**
 * @param {string} url the url of an svg file
 * @returns {Promise<ReturnType<markup>|null>} the content of that file, or null
 *  if it couldn't be fetched or isn't a usable svg
 */
export function loadSvg(url) {
    return get(url, "text")
        .then(parseSvg)
        .catch(() => null);
}
