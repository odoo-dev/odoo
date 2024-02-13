import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { fillEmpty } from "../utils/dom";
import { isEmptyBlock, isWhitespace } from "../utils/dom_info";
import { splitAroundUntil } from "../utils/dom_split";
import { closestElement, descendants } from "../utils/dom_traversal";
import { getDeepRange, getSelectedNodes } from "../utils/selection";
import { FontColorSelector } from "./font_color_selector";

const TEXT_CLASSES_REGEX = /\btext-[^\s]*\b/;
const BG_CLASSES_REGEX = /\bbg-[^\s]*\b/;

/**
 * @param {string} [value]
 * @returns {boolean}
 */
function isColorGradient(value) {
    // FIXME duplicated in @web_editor/utils.js
    return value && value.includes("-gradient(");
}

/**
 * Returns true if the given element has a visible color (fore- or
 * -background depending on the given mode).
 *
 * @param {Element} element
 * @param {string} mode 'color' or 'backgroundColor'
 * @returns {boolean}
 */
function hasColor(element, mode) {
    const style = element.style;
    const parent = element.parentNode;
    const classRegex = mode === "color" ? TEXT_CLASSES_REGEX : BG_CLASSES_REGEX;
    if (isColorGradient(style["background-image"])) {
        if (element.classList.contains("text-gradient")) {
            if (mode === "color") {
                return true;
            }
        } else {
            if (mode !== "color") {
                return true;
            }
        }
    }
    return (
        (style[mode] &&
            style[mode] !== "inherit" &&
            (!parent || style[mode] !== parent.style[mode])) ||
        (classRegex.test(element.className) &&
            (!parent || getComputedStyle(element)[mode] !== getComputedStyle(parent)[mode]))
    );
}

export class ColorPlugin extends Plugin {
    static name = "color";
    static dependencies = ["selection"];
    static resources = () => ({
        toolbarGroup: {
            id: "color",
            sequence: 28,
            buttons: [
                {
                    id: "forecolor",
                    Component: FontColorSelector,
                    props: {
                        type: "foreground",
                    },
                },
                {
                    id: "backcolor",
                    Component: FontColorSelector,
                    props: {
                        type: "background",
                    },
                },
            ],
        },
    });

    handleCommand(command, payload) {
        switch (command) {
            case "APPLY_COLOR":
                this.applyColor(payload.color, payload.mode);
                break;
        }
    }

    /**
     * Apply a css or class color on the current selection (wrapped in <font>).
     *
     * @param {string} color hexadecimal or bg-name/text-name class
     * @param {string} mode 'color' or 'backgroundColor'
     * @param {Element} [element]
     */
    applyColor(color, mode) {
        // const element = false;
        // const selectedTds = [...editor.editable.querySelectorAll('td.o_selected_td')].filter(
        //     node => closestElement(node).isContentEditable
        // );
        // let coloredTds = [];
        // if (selectedTds.length && mode === "backgroundColor") {
        //     for (const td of selectedTds) {
        //         colorElement(td, color, mode);
        //     }
        //     coloredTds = [...selectedTds];
        // } else if (element) {
        //     colorElement(element, color, mode);
        //     return [element];
        // }
        // const selection = this.shared.getEditableSelection();
        // let wasCollapsed = false;
        // if (selection.getRangeAt(0).collapsed && !selectedTds.length) {
        //     insertAndSelectZws(selection);
        //     wasCollapsed = true;
        // }
        const range = getDeepRange(this.editable, { splitText: true, select: true });
        if (!range) {
            return;
        }
        const selectionToRestore = this.shared.getEditableSelection();
        // Get the <font> nodes to color
        const selectionNodes = getSelectedNodes(this.editable).filter(
            (node) => closestElement(node).isContentEditable
        );
        if (isEmptyBlock(range.endContainer)) {
            selectionNodes.push(range.endContainer, ...descendants(range.endContainer));
        }
        const selectedNodes =
            mode === "backgroundColor"
                ? selectionNodes.filter((node) => !closestElement(node, "table.o_selected_table"))
                : selectionNodes;
        // const selectedFieldNodes = new Set(getSelectedNodes(editor.editable)
        //         .map(n => closestElement(n, "*[t-field],*[t-out],*[t-esc]"))
        //         .filter(Boolean));

        const getFonts = (selectedNodes) => {
            return selectedNodes.flatMap((node) => {
                let font = closestElement(node, "font") || closestElement(node, "span");
                const children = font && descendants(font);
                if (
                    font &&
                    (font.nodeName === "FONT" || (font.nodeName === "SPAN" && font.style[mode]))
                ) {
                    // Partially selected <font>: split it.
                    const selectedChildren = children.filter((child) =>
                        selectedNodes.includes(child)
                    );
                    if (selectedChildren.length) {
                        font = splitAroundUntil(selectedChildren, font);
                    } else {
                        font = [];
                    }
                } else if (
                    (node.nodeType === Node.TEXT_NODE && !isWhitespace(node)) ||
                    (node.nodeName === "BR" && isEmptyBlock(node.parentNode)) ||
                    (node.nodeType === Node.ELEMENT_NODE &&
                        ["inline", "inline-block"].includes(getComputedStyle(node).display) &&
                        !isWhitespace(node.textContent) &&
                        !node.classList.contains("btn") &&
                        !node.querySelector("font"))
                ) {
                    // Node is a visible text or inline node without font nor a button:
                    // wrap it in a <font>.
                    const previous = node.previousSibling;
                    const classRegex = mode === "color" ? BG_CLASSES_REGEX : TEXT_CLASSES_REGEX;
                    if (
                        previous &&
                        previous.nodeName === "FONT" &&
                        !previous.style[mode === "color" ? "backgroundColor" : "color"] &&
                        !classRegex.test(previous.className) &&
                        selectedNodes.includes(previous.firstChild) &&
                        selectedNodes.includes(previous.lastChild)
                    ) {
                        // Directly follows a fully selected <font> that isn't
                        // colored in the other mode: append to that.
                        font = previous;
                    } else {
                        // No <font> found: insert a new one.
                        font = this.document.createElement("font");
                        node.after(font);
                    }
                    if (node.textContent) {
                        font.appendChild(node);
                    } else {
                        fillEmpty(font);
                    }
                } else {
                    font = []; // Ignore non-text or invisible text nodes.
                }
                return font;
            });
        };

        // for (const fieldNode of selectedFieldNodes) {
        //     colorElement(fieldNode, color, mode);
        // }

        let fonts = getFonts(selectedNodes);
        // Dirty fix as the previous call could have unconnected elements
        // because of the `splitAroundUntil`. Another call should provide he
        // correct list of fonts.
        if (!fonts.every((font) => font.isConnected)) {
            fonts = getFonts(selectedNodes);
        }

        // Color the selected <font>s and remove uncolored fonts.
        const fontsSet = new Set(fonts);
        for (const font of fontsSet) {
            this.colorElement(font, color, mode);
            if (
                !hasColor(font, "color") &&
                !hasColor(font, "backgroundColor") &&
                (!font.hasAttribute("style") || !color)
            ) {
                for (const child of [...font.childNodes]) {
                    font.parentNode.insertBefore(child, font);
                }
                font.parentNode.removeChild(font);
                fontsSet.delete(font);
            }
        }
        this.shared.setSelection(selectionToRestore, false);
        // if (wasCollapsed) {
        //     const newSelection = this.shared.getEditableSelection();
        //     const range = new Range();
        //     range.setStart(newSelection.anchorNode, newSelection.anchorOffset);
        //     range.collapse(true);
        //     newSelection.removeAllRanges();
        //     newSelection.addRange(range);
        // }
        // return [...fontsSet, ...colore
    }

    /**
     * Applies a css or class color (fore- or background-) to an element.
     * Replace the color that was already there if any.
     *
     * @param {Element} element
     * @param {string} color hexadecimal or bg-name/text-name class
     * @param {string} mode 'color' or 'backgroundColor'
     */
    colorElement(element, color, mode) {
        const newClassName = element.className
            .replace(mode === "color" ? TEXT_CLASSES_REGEX : BG_CLASSES_REGEX, "")
            .replace(/\btext-gradient\b/g, "") // cannot be combined with setting a background
            .replace(/\s+/, " ");
        element.className !== newClassName && (element.className = newClassName);
        element.style["background-image"] = "";
        if (mode === "backgroundColor") {
            element.style["background"] = "";
        }
        if (color.startsWith("text") || color.startsWith("bg-")) {
            element.style[mode] = "";
            element.classList.add(color);
        } else if (isColorGradient(color)) {
            element.style[mode] = "";
            if (mode === "color") {
                element.style["background"] = "";
                element.style["background-image"] = color;
                element.classList.add("text-gradient");
            } else {
                element.style["background-image"] = color;
            }
        } else {
            element.style[mode] = color;
        }
    }
}

registry.category("phoenix_plugins").add("color", ColorPlugin);
