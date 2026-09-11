import { lightenColor } from "@web/core/colors/colors";
import { url } from "@web/core/utils/urls";
import { session } from "@web/session";

import {
    getContrastColor,
    getNormalizedColor,
    getReadableColor,
} from "@im_livechat/embed/common/color_utils";

// Must match livechat_theme_colors.scss's --o-bubble-bg-ratio: the bubble background is
// diluted toward white by this much, so the text color picked against it needs to be
// computed against that same color.
const BUBBLE_BG_DILUTION = 0.65;

async function loadFont(name, url, targetDocument) {
    await targetDocument.fonts.ready;
    if ([...targetDocument.fonts].some(({ family }) => family === name)) {
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
    targetDocument.head.appendChild(link);
    targetDocument.head.appendChild(style);
    return loadPromise;
}

function loadStyle(target) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url("/im_livechat/assets_embed.css");
    const stylesLoadedPromise = new Promise((res, rej) => {
        link.addEventListener("load", res);
        link.addEventListener("error", rej);
    });
    target.appendChild(link);
    return stylesLoadedPromise;
}

/**
 * @param {HTMLElement} target
 * @returns {HTMLDivElement}
 */
export function makeRoot(target) {
    const root = document.createElement("div");
    root.classList.add("o-livechat-root");
    root.setAttribute("id", `o-livechat-root-${luxon.DateTime.now().ts + Math.random()}`);
    root.style.zIndex = "calc(9e999)";
    root.style.position = "relative";
    root.style.display = "block";
    const options = session.livechatData?.options ?? {};
    for (const [name, value] of [
        ["--o-mail-livechat-primary", options.primary_color],
        ["--o-mail-livechat-primary-text", options.primary_text_color],
        ["--o-mail-livechat-secondary", options.secondary_color],
        ["--o-mail-livechat-secondary-text", options.secondary_text_color],
        [
            "--o-mail-livechat-primary-bubble-text",
            options.primary_color &&
                getContrastColor(lightenColor(options.primary_color, BUBBLE_BG_DILUTION)),
        ],
        [
            "--o-mail-livechat-secondary-bubble-text",
            options.secondary_color &&
                getContrastColor(lightenColor(options.secondary_color, BUBBLE_BG_DILUTION)),
        ],
        [
            "--o-mail-livechat-primary-readable",
            options.primary_color && getReadableColor(options.primary_color),
        ],
        [
            "--o-mail-livechat-secondary-readable",
            options.secondary_color && getReadableColor(options.secondary_color),
        ],
        [
            "--o-mail-livechat-primary-border",
            options.primary_color && getNormalizedColor(options.primary_color, 0.7),
        ],
        [
            "--o-mail-livechat-secondary-border",
            options.secondary_color && getNormalizedColor(options.secondary_color, 0.7),
        ],
    ]) {
        if (value) {
            root.style.setProperty(name, value);
        }
    }
    target.appendChild(root);
    return root;
}

export async function loadAssets(styleTarget) {
    const document = styleTarget.ownerDocument;
    await Promise.all([
        loadStyle(styleTarget),
        loadFont(
            "Material Symbols Outlined",
            url("/im_livechat/material_symbols_outlined"),
            document
        ),
        loadFont("odoo_ui_icons", url("/im_livechat/odoo_ui_icons"), document),
    ]);
}

/**
 * Initialize the livechat container by loading the styles and
 * the fonts.
 *
 * @param {HTMLElement} root
 * @returns {Promise<ShadowRoot>}
 */
export async function makeShadow(root) {
    const shadow = root.attachShadow({ mode: "open" });
    await loadAssets(shadow);
    return shadow;
}
