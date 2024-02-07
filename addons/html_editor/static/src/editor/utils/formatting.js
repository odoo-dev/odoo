import { isBlock } from "./blocks";
import { removeClass, unwrapContents } from "./dom";
import { splitAroundUntil } from "./dom_split";
import {
    hasClass,
    isBold,
    isDirectionSwitched,
    isFontSize,
    isItalic,
    isStrikeThrough,
    isUnderline,
    isVisibleTextNode,
    isZWS,
} from "./dom_info";
import { closestElement } from "./dom_traversal";
import { insertAndSelectZws } from "./insertion";
import { DIRECTIONS } from "./position";
import {
    getCursorDirection,
    getDeepRange,
    getSelectedNodes,
    getTraversedNodes,
    setSelection,
} from "./selection";
import { normalizeCSSColor } from "@web/core/utils/colors";

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

const formatsSpecs = {
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
            removeClass(node, ...FONT_SIZE_CLASSES);
        },
        removeStyle: (node) => removeStyle(node, "font-size"),
    },
    setFontSizeClassName: {
        isFormatted: hasClass,
        hasStyle: (node, props) => FONT_SIZE_CLASSES.find((cls) => node.classList.contains(cls)),
        addStyle: (node, props) => node.classList.add(props.className),
        removeStyle: (node) => removeClass(node, ...FONT_SIZE_CLASSES, ...TEXT_STYLE_CLASSES),
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

/**
 * Return true if the current selection on the editable appears as the given
 * format. The selection is considered to appear as that format if every text
 * node in it appears as that format.
 *
 * @param {Element} editable
 * @param {String} format 'bold'|'italic'|'underline'|'strikeThrough'|'switchDirection'
 * @returns {boolean}
 */
export function isSelectionFormat(editable, format) {
    const selectedNodes = getTraversedNodes(editable).filter(
        (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue.trim().length
    );
    const isFormatted = formatsSpecs[format].isFormatted;
    return selectedNodes && selectedNodes.every((n) => isFormatted(n, editable));
}

function getOrCreateSpan(node, ancestors) {
    const span = ancestors.find((element) => element.tagName === "SPAN" && element.isConnected);
    if (span) {
        return span;
    } else {
        const span = document.createElement("span");
        node.after(span);
        span.append(node);
        return span;
    }
}
function removeFormat(node, formatSpec) {
    node = closestElement(node);
    if (formatSpec.hasStyle(node)) {
        formatSpec.removeStyle(node);
        if (["SPAN", "FONT"].includes(node.tagName) && !node.getAttributeNames().length) {
            return unwrapContents(node);
        }
    }

    if (formatSpec.isTag && formatSpec.isTag(node)) {
        const attributesNames = node.getAttributeNames().filter((name) => {
            return name !== "data-oe-zws-empty-inline";
        });
        if (attributesNames.length) {
            // Change tag name
            const newNode = document.createElement("span");
            while (node.firstChild) {
                newNode.appendChild(node.firstChild);
            }
            for (let index = node.attributes.length - 1; index >= 0; --index) {
                newNode.attributes.setNamedItem(node.attributes[index].cloneNode());
            }
            node.parentNode.replaceChild(newNode, node);
        } else {
            unwrapContents(node);
        }
    }
}

export function formatSelection(editable, formatName, { applyStyle, formatProps } = {}) {
    const selection = editable.ownerDocument.getSelection();
    let direction;
    let wasCollapsed;
    if (editable.querySelector(".o_selected_td")) {
        direction = DIRECTIONS.RIGHT;
    } else {
        if (!selection.rangeCount) {
            return;
        }
        wasCollapsed = selection.getRangeAt(0).collapsed;

        direction = getCursorDirection(
            selection.anchorNode,
            selection.anchorOffset,
            selection.focusNode,
            selection.focusOffset
        );
    }
    getDeepRange(editable, { splitText: true, select: true, correctTripleClick: true });

    if (typeof applyStyle === "undefined") {
        applyStyle = !isSelectionFormat(editable, formatName);
    }

    let zws;
    if (wasCollapsed) {
        if (
            selection.anchorNode.nodeType === Node.TEXT_NODE &&
            selection.anchorNode.textContent === "\u200b"
        ) {
            zws = selection.anchorNode;
            selection.getRangeAt(0).selectNode(zws);
        } else {
            zws = insertAndSelectZws(selection);
        }
        getDeepRange(editable, { splitText: true, select: true, correctTripleClick: true });
    }

    // Get selected nodes within td to handle non-p elements like h1, h2...
    // Targeting <br> to ensure span stays inside its corresponding block node.
    const selectedNodesInTds = [...editable.querySelectorAll(".o_selected_td")].map((node) =>
        closestElement(node).querySelector("br")
    );
    const selectedNodes = getSelectedNodes(editable).filter(
        (n) =>
            n.nodeType === Node.TEXT_NODE &&
            closestElement(n).isContentEditable &&
            (isVisibleTextNode(n) || isZWS(n))
    );
    const selectedTextNodes = selectedNodes.length ? selectedNodes : selectedNodesInTds;

    const selectedFieldNodes = new Set(
        getSelectedNodes(editable)
            .map((n) => closestElement(n, "*[t-field],*[t-out],*[t-esc]"))
            .filter(Boolean)
    );

    const formatSpec = formatsSpecs[formatName];
    for (const selectedTextNode of selectedTextNodes) {
        const inlineAncestors = [];
        let currentNode = selectedTextNode;
        let parentNode = selectedTextNode.parentElement;

        // Remove the format on all inline ancestors until a block or an element
        // with a class that is not related to font size (in case the formatting
        // comes from the class).
        while (
            parentNode &&
            !isBlock(parentNode) &&
            (parentNode.classList.length === 0 ||
                [...parentNode.classList].every((cls) => FONT_SIZE_CLASSES.includes(cls)))
        ) {
            const isUselessZws =
                parentNode.tagName === "SPAN" &&
                parentNode.hasAttribute("data-oe-zws-empty-inline") &&
                parentNode.getAttributeNames().length === 1;

            if (isUselessZws) {
                unwrapContents(parentNode);
            } else {
                const newLastAncestorInlineFormat = splitAroundUntil(currentNode, parentNode);
                removeFormat(newLastAncestorInlineFormat, formatSpec);
                if (newLastAncestorInlineFormat.isConnected) {
                    inlineAncestors.push(newLastAncestorInlineFormat);
                    currentNode = newLastAncestorInlineFormat;
                }
            }

            parentNode = currentNode.parentElement;
        }

        const firstBlockOrClassHasFormat = formatSpec.isFormatted(parentNode, formatProps);
        if (firstBlockOrClassHasFormat && !applyStyle) {
            formatSpec.addNeutralStyle &&
                formatSpec.addNeutralStyle(getOrCreateSpan(selectedTextNode, inlineAncestors));
        } else if (!firstBlockOrClassHasFormat && applyStyle) {
            const tag = formatSpec.tagName && document.createElement(formatSpec.tagName);
            if (tag) {
                selectedTextNode.after(tag);
                tag.append(selectedTextNode);

                if (!formatSpec.isFormatted(tag, formatProps)) {
                    tag.after(selectedTextNode);
                    tag.remove();
                    formatSpec.addStyle(
                        getOrCreateSpan(selectedTextNode, inlineAncestors),
                        formatProps
                    );
                }
            } else if (formatName !== "fontSize" || formatProps.size !== undefined) {
                formatSpec.addStyle(
                    getOrCreateSpan(selectedTextNode, inlineAncestors),
                    formatProps
                );
            }
        }
    }

    for (const selectedFieldNode of selectedFieldNodes) {
        if (applyStyle) {
            formatSpec.addStyle(selectedFieldNode, formatProps);
        } else {
            formatSpec.removeStyle(selectedFieldNode);
        }
    }

    if (zws) {
        const siblings = [...zws.parentElement.childNodes];
        if (
            !isBlock(zws.parentElement) &&
            selectedTextNodes.includes(siblings[0]) &&
            selectedTextNodes.includes(siblings[siblings.length - 1])
        ) {
            zws.parentElement.setAttribute("data-oe-zws-empty-inline", "");
        } else {
            const span = document.createElement("span");
            span.setAttribute("data-oe-zws-empty-inline", "");
            zws.before(span);
            span.append(zws);
        }
    }

    if (selectedTextNodes[0] && selectedTextNodes[0].textContent === "\u200B") {
        setSelection(selectedTextNodes[0], 0);
    } else if (selectedTextNodes.length) {
        const firstNode = selectedTextNodes[0];
        const lastNode = selectedTextNodes[selectedTextNodes.length - 1];
        if (direction === DIRECTIONS.RIGHT) {
            setSelection(firstNode, 0, lastNode, lastNode.length, false);
        } else {
            setSelection(lastNode, lastNode.length, firstNode, 0, false);
        }
    }
}

/**
 * @param {string} key
 * @param {object} htmlStyle
 * @returns {string}
 */
export function getCSSVariableValue(key, htmlStyle) {
    // Get trimmed value from the HTML element
    let value = htmlStyle.getPropertyValue(`--${key}`).trim();
    // If it is a color value, it needs to be normalized
    value = normalizeCSSColor(value);
    // Normally scss-string values are "printed" single-quoted. That way no
    // magic conversation is needed when customizing a variable: either save it
    // quoted for strings or non quoted for colors, numbers, etc. However,
    // Chrome has the annoying behavior of changing the single-quotes to
    // double-quotes when reading them through getPropertyValue...
    return value.replace(/"/g, "'");
}

/**
 * Key-value mapping to list converters from an unit A to an unit B.
 * - The key is a string in the format '$1-$2' where $1 is the CSS symbol of
 *   unit A and $2 is the CSS symbol of unit B.
 * - The value is a function that converts the received value (expressed in
 *   unit A) to another value expressed in unit B. Two other parameters is
 *   received: the css property on which the unit applies and the jQuery element
 *   on which that css property may change.
 */
const CSS_UNITS_CONVERSION = {
    "s-ms": () => 1000,
    "ms-s": () => 0.001,
    "rem-px": (htmlStyle) => parseFloat(htmlStyle["font-size"]),
    "px-rem": (htmlStyle) => 1 / parseFloat(htmlStyle["font-size"]),
    "%-px": () => -1, // Not implemented but should simply be ignored for now
    "px-%": () => -1, // Not implemented but should simply be ignored for now
};

/**
 * Converts the given numeric value expressed in the given css unit into
 * the corresponding numeric value expressed in the other given css unit.
 *
 * e.g. fct(400, 'ms', 's') -> 0.4
 *
 * @param {number} value
 * @param {string} unitFrom
 * @param {string} unitTo
 * @param {object} htmlStyle
 * @returns {number}
 */
export function convertNumericToUnit(value, unitFrom, unitTo, htmlStyle) {
    if (Math.abs(value) < Number.EPSILON || unitFrom === unitTo) {
        return value;
    }
    const converter = CSS_UNITS_CONVERSION[`${unitFrom}-${unitTo}`];
    if (converter === undefined) {
        throw new Error(`Cannot convert '${unitFrom}' units into '${unitTo}' units !`);
    }
    return value * converter(htmlStyle);
}

export function getHtmlStyle(document) {
    return document.defaultView.getComputedStyle(document.documentElement);
}

/**
 * Finds the font size to display for the current selection. We cannot rely
 * on the computed font-size only as font-sizes are responsive and we always
 * want to display the desktop (integer when possible) one.
 *
 * @param {Selection} sel The current selection.
 * @param {Document} document The document of the current selection.
 * @returns {Float} The font size to display.
 */
export function getFontSizeDisplayValue(sel, document) {
    const tagNameRelatedToFontSize = ["h1", "h2", "h3", "h4", "h5", "h6"];
    const styleClassesRelatedToFontSize = ["display-1", "display-2", "display-3", "display-4"];
    const closestStartContainerEl = closestElement(sel.getRangeAt(0).startContainer);
    const closestFontSizedEl = closestStartContainerEl.closest(`
        [style*='font-size'],
        ${FONT_SIZE_CLASSES.map((className) => `.${className}`)},
        ${styleClassesRelatedToFontSize.map((className) => `.${className}`)},
        ${tagNameRelatedToFontSize}
    `);
    let remValue;
    const htmlStyle = getHtmlStyle(document);
    if (closestFontSizedEl) {
        const useFontSizeInput = closestFontSizedEl.style.fontSize;
        if (useFontSizeInput) {
            // Use the computed value to always convert to px. However, this
            // currently does not check that the inline font-size is the one
            // actually having an effect (there could be an !important CSS rule
            // forcing something else).
            // TODO align with the behavior of the rest of the editor snippet
            // options.
            return parseFloat(getComputedStyle(closestStartContainerEl).fontSize);
        }
        // It's a class font size or a hN tag. We don't return the computed
        // font size because it can be different from the one displayed in
        // the toolbar because it's responsive.
        const fontSizeClass = FONT_SIZE_CLASSES.find((className) =>
            closestFontSizedEl.classList.contains(className)
        );
        let fsName;
        if (fontSizeClass) {
            fsName = fontSizeClass.substring(0, fontSizeClass.length - 3); // Without -fs
        } else {
            fsName =
                styleClassesRelatedToFontSize.find((className) =>
                    closestFontSizedEl.classList.contains(className)
                ) || closestFontSizedEl.tagName.toLowerCase();
        }
        remValue = parseFloat(getCSSVariableValue(`${fsName}-font-size`, htmlStyle));
    }
    // It's default font size (no font size class / style).
    if (remValue === undefined) {
        remValue = parseFloat(getCSSVariableValue("font-size-base", htmlStyle));
    }
    const pxValue = convertNumericToUnit(remValue, "rem", "px", htmlStyle);
    return pxValue || parseFloat(getComputedStyle(closestStartContainerEl).fontSize);
}
