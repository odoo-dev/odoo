import { markup } from "@odoo/owl";
import { get } from "@web/core/network/http_service";
import { createElementWithContent } from "@web/core/utils/html";

/**
 * Inline SVG "DSL".
 *
 * In an html content, any `<img>` pointing to a same origin `.svg` file is
 * replaced by the content of that file. This allows html coming from data
 * (e.g. the `help` of an action) to embed pictograms that inherit the
 * surrounding styles (`currentColor`, hover states, ...), while staying plain
 * html:
 *
 *     <img src="/web/static/picto/poof.svg" class="text-primary"/>
 *     <p>This is the help</p>
 *
 * The classes set on the `<img>` are added to the root `<svg>` element, on top of
 * the ones the file itself declares.
 *
 * The substitution is done on the html itself, before the content is rendered
 * (see the `onWillStart` of `ActionHelper`), so the pictograms are there from
 * the first frame.
 */

const FORBIDDEN_TAGS = new Set(["script", "foreignobject", "iframe", "image", "audio", "video"]);

/** Attributes taken from the `<img>` and copied onto the resulting `<svg>`. */
const FORWARDED_ATTRIBUTES = ["id", "style", "width", "height", "title"];

/**
 * @param {HTMLImageElement} img
 * @returns {boolean} whether that image is a same origin svg, and can thus be inlined
 */
function isInlinableSvg(img) {
    const src = img.getAttribute("src") || "";
    if (!/\.svg([?#].*)?$/i.test(src)) {
        return false;
    }
    try {
        return new URL(src, location.href).origin === location.origin;
    } catch {
        return false;
    }
}

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
 * @returns {SVGElement|null}
 */
function parseSvg(content) {
    const doc = new DOMParser().parseFromString(content, "image/svg+xml");
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) {
        return null;
    }
    sanitizeSvg(svg);
    return svg;
}

/**
 * @param {string} url
 * @returns {Promise<SVGElement|null>} null if the file couldn't be used
 */
function loadSvg(url) {
    return get(url, "text")
        .then(parseSvg)
        .catch(() => null);
}

/**
 * @param {SVGElement} svg
 * @param {HTMLImageElement} img
 */
function forwardAttributes(svg, img) {
    for (const name of FORWARDED_ATTRIBUTES) {
        if (img.hasAttribute(name)) {
            svg.setAttribute(name, img.getAttribute(name));
        }
    }
    for (const name of img.getAttributeNames()) {
        if (name.startsWith("data-")) {
            svg.setAttribute(name, img.getAttribute(name));
        }
    }
    // classes of the <img> are added to those already on the <svg> root element
    svg.classList.add(...img.classList);
    svg.setAttribute("role", "img");
    svg.setAttribute("focusable", "false");
    const alt = img.getAttribute("alt");
    if (alt) {
        svg.setAttribute("aria-label", alt);
    } else {
        svg.setAttribute("aria-hidden", "true");
    }
}

/**
 * Replaces, in `content`, every `<img>` pointing to a same origin svg by the
 * content of that svg. Images that can't be loaded are left untouched.
 *
 * @param {string | ReturnType<markup>} content
 * @returns {Promise<ReturnType<markup>>}
 */
export async function inlineSvgImages(content) {
    const root = createElementWithContent("div", content);
    const images = [...root.querySelectorAll("img")].filter(isInlinableSvg);
    await Promise.all(
        images.map(async (img) => {
            const svg = await loadSvg(img.getAttribute("src"));
            if (!svg) {
                return;
            }
            forwardAttributes(svg, img);
            img.replaceWith(svg);
        })
    );
    // markup: `content` is markup (or has been escaped as text by
    // `createElementWithContent`), and the svg files are part of the code base
    return markup(root.innerHTML);
}
