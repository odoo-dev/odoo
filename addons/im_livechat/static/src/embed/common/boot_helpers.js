/* @odoo-module */

import { url } from "@web/core/utils/urls";

export async function loadFont(name, url) {
    await document.fonts.ready;
    if ([...document.fonts].some(({ family }) => family === name)) {
        // Font already loaded.
        return;
    }
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "font";
    link.href = url;
    link.crossOrigin = "";
    const style = document.createElement("style");
    style.appendChild(
        document.createTextNode(`
            @font-face {
                font-family: ${name};
                src: url('${url}') format('woff2');
                font-weight: normal;
                font-style: normal;
                font-display: block;
            }
        `)
    );
    const loadPromise = new Promise((res, rej) => {
        link.addEventListener("load", res);
        link.addEventListener("error", rej);
    });
    document.head.appendChild(link);
    document.head.appendChild(style);
    return loadPromise;
}

/**
 * @param {HTMLElement} target
 * @returns {HTMLDivElement}
 */
export function makeRoot(target) {
    const root = document.createElement("div");
    root.classList.add("o-livechat-root");
    target.appendChild(root);
    return root;
}

/**
 * Initialize the livechat container by loading the styles and
 * the fonts.
 *
 * @param {HTMLElement} root
 * @returns {ShadowRoot}
 */
export async function makeShadow(root) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url("/im_livechat/assets_embed.css");
    const shadow = root.attachShadow({ mode: "open" });
    shadow.appendChild(link);
    await new Promise((res, rej) => {
        link.addEventListener("load", res);
        link.addEventListener("error", rej);
    });
    return shadow;
}
