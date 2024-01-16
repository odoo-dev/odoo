/** @odoo-module */

import {
    hasClass,
    isBold,
    isDirectionSwitched,
    isFontSize,
    isItalic,
    isStrikeThrough,
    isUnderline,
} from "./dom_info";

/**
 * Array of all the classes used by the editor to change the font size.
 */
export const FONT_SIZE_CLASSES = [
    "display-1-fs",
    "display-2-fs",
    "display-3-fs",
    "display-4-fs",
    "h1-fs",
    "h2-fs",
    "h3-fs",
    "h4-fs",
    "h5-fs",
    "h6-fs",
    "base-fs",
    "small",
];

export const TEXT_STYLE_CLASSES = ["display-1", "display-2", "display-3", "display-4", "lead"];

export const formatsSpecs = {
    italic: {
        tagName: "em",
        isFormatted: isItalic,
        isTag: (node) => ["EM", "I"].includes(node.tagName),
        hasStyle: (node) => Boolean(node.style && node.style["font-style"]),
        addStyle: (node) => (node.style["font-style"] = "italic"),
        addNeutralStyle: (node) => (node.style["font-style"] = "normal"),
        removeStyle: (node) => removeStyle(node, "font-style"),
    },
    bold: {
        tagName: "strong",
        isFormatted: isBold,
        isTag: (node) => ["STRONG", "B"].includes(node.tagName),
        hasStyle: (node) => Boolean(node.style && node.style["font-weight"]),
        addStyle: (node) => (node.style["font-weight"] = "bolder"),
        addNeutralStyle: (node) => {
            node.style["font-weight"] = "normal";
        },
        removeStyle: (node) => removeStyle(node, "font-weight"),
    },
    underline: {
        tagName: "u",
        isFormatted: isUnderline,
        isTag: (node) => node.tagName === "U",
        hasStyle: (node) => node.style && node.style["text-decoration-line"].includes("underline"),
        addStyle: (node) => (node.style["text-decoration-line"] += " underline"),
        removeStyle: (node) => removeStyle(node, "text-decoration-line", "underline"),
    },
    strikeThrough: {
        tagName: "s",
        isFormatted: isStrikeThrough,
        isTag: (node) => node.tagName === "S",
        hasStyle: (node) =>
            node.style && node.style["text-decoration-line"].includes("line-through"),
        addStyle: (node) => (node.style["text-decoration-line"] += " line-through"),
        removeStyle: (node) => removeStyle(node, "text-decoration-line", "line-through"),
    },
    fontSize: {
        isFormatted: isFontSize,
        hasStyle: (node) => node.style && node.style["font-size"],
        addStyle: (node, props) => {
            node.style["font-size"] = props.size;
            node.classList.remove(...FONT_SIZE_CLASSES);
        },
        removeStyle: (node) => removeStyle(node, "font-size"),
    },
    setFontSizeClassName: {
        isFormatted: hasClass,
        hasStyle: (node, props) => FONT_SIZE_CLASSES.find((cls) => node.classList.contains(cls)),
        addStyle: (node, props) => node.classList.add(props.className),
        removeStyle: (node) => {
            node.classList.remove(...FONT_SIZE_CLASSES, ...TEXT_STYLE_CLASSES);
            if (node.classList.length === 0) {
                node.removeAttribute("class");
            }
        },
    },
    switchDirection: {
        isFormatted: isDirectionSwitched,
    },
};

function removeStyle(node, styleName, item) {
    if (item) {
        const newStyle = node.style[styleName]
            .split(" ")
            .filter((x) => x !== item)
            .join(" ");
        node.style[styleName] = newStyle || null;
    } else {
        node.style[styleName] = null;
    }
    if (node.getAttribute("style") === "") {
        node.removeAttribute("style");
    }
}
