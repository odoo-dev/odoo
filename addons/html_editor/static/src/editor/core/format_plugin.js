import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestElement } from "../utils/dom_traversal";
import { FONT_SIZE_CLASSES, formatsSpecs, isSelectionFormat } from "../utils/formatting";
import { getDeepRange, getSelectedNodes, getTraversedNodes } from "../utils/selection";
import { insertAndSelectZws } from "../utils/insertion";
import { isVisibleTextNode, isZWS } from "../utils/dom_info";
import { isBlock } from "../utils/blocks";
import { unwrapContents } from "../utils/dom";
import { splitAroundUntil } from "../utils/dom_split";
import { DIRECTIONS } from "../utils/position";

function isFormatted(format) {
    return (el, selection) => isSelectionFormat(el, format, selection);
}

export class FormatPlugin extends Plugin {
    static name = "format";
    static dependencies = ["selection"];
    static resources = () => ({
        shortcuts: [
            { hotkey: "control+b", command: "FORMAT_BOLD" },
            { hotkey: "control+i", command: "FORMAT_ITALIC" },
            { hotkey: "control+u", command: "FORMAT_UNDERLINE" },
            { hotkey: "control+5", command: "FORMAT_STRIKETHROUGH" },
        ],
        toolbarGroup: {
            id: "decoration",
            sequence: 20,
            buttons: [
                {
                    id: "bold",
                    cmd: "FORMAT_BOLD",
                    icon: "fa-bold",
                    name: "Toggle bold",
                    isFormatApplied: isFormatted("bold"),
                },
                {
                    id: "italic",
                    cmd: "FORMAT_ITALIC",
                    icon: "fa-italic",
                    name: "Toggle italic",
                    isFormatApplied: isFormatted("italic"),
                },
                {
                    id: "underline",
                    cmd: "FORMAT_UNDERLINE",
                    icon: "fa-underline",
                    name: "Toggle underline",
                    isFormatApplied: isFormatted("underline"),
                },
                {
                    id: "strikethrough",
                    cmd: "FORMAT_STRIKETHROUGH",
                    icon: "fa-strikethrough",
                    name: "Toggle strikethrough",
                    isFormatApplied: isFormatted("strikeThrough"),
                },
            ],
        },
    });

    handleCommand(command, payload) {
        switch (command) {
            case "FORMAT_BOLD":
                this.formatSelection("bold");
                break;
            case "FORMAT_ITALIC":
                this.formatSelection("italic");
                break;
            case "FORMAT_UNDERLINE":
                this.formatSelection("underline");
                break;
            case "FORMAT_STRIKETHROUGH":
                this.formatSelection("strikeThrough");
                break;
            case "FORMAT_FONT_SIZE":
                this.formatSelection("fontSize", {
                    applyStyle: true,
                    formatProps: { size: payload.size },
                });
                break;
            case "FORMAT_FONT_SIZE_CLASSNAME":
                this.formatSelection("setFontSizeClassName", {
                    formatProps: { className: payload.className },
                });
                break;
            case "FORMAT_REMOVE_FORMAT":
                this.removeFormat();
                break;
        }
    }

    removeFormat() {
        this.document.execCommand("removeFormat");
        for (const node of getTraversedNodes(this.editable)) {
            // The only possible background image on text is the gradient.
            closestElement(node).style.backgroundImage = "";
        }
    }

    formatSelection(formatName, { applyStyle, formatProps } = {}) {
        let selection = this.shared.getEditableSelection();
        const direction = selection.direction;
        const wasCollapsed = selection.isCollapsed;
        const range = getDeepRange(this.editable, {
            sel: selection,
            splitText: true,
            correctTripleClick: true,
        });
        // note: does it work if selection is in opposite direction?
        selection = this.shared.setSelection(
            range.startContainer,
            range.startOffset,
            range.endContainer,
            range.endOffset,
            false
        );

        if (typeof applyStyle === "undefined") {
            applyStyle = !isSelectionFormat(this.editable, formatName, selection);
        }

        let zws;
        if (wasCollapsed) {
            if (
                selection.anchorNode.nodeType === Node.TEXT_NODE &&
                selection.anchorNode.textContent === "\u200b"
            ) {
                zws = selection.anchorNode;
                this.shared.setSelection(zws, 0, zws, 1);
            } else {
                // @todo phoenix: move it to selection plugin ?
                zws = insertAndSelectZws(this.document.getSelection());
            }
            getDeepRange(this.editable, {
                splitText: true,
                select: true,
                correctTripleClick: true,
            });
        }

        // Get selected nodes within td to handle non-p elements like h1, h2...
        // Targeting <br> to ensure span stays inside its corresponding block node.
        const selectedNodesInTds = [...this.editable.querySelectorAll(".o_selected_td")].map(
            (node) => closestElement(node).querySelector("br")
        );
        const selectedNodes = getSelectedNodes(this.editable).filter(
            (n) =>
                n.nodeType === Node.TEXT_NODE &&
                closestElement(n).isContentEditable &&
                (isVisibleTextNode(n) || isZWS(n))
        );
        const selectedTextNodes = selectedNodes.length ? selectedNodes : selectedNodesInTds;

        const selectedFieldNodes = new Set(
            getSelectedNodes(this.editable)
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
                const tag = formatSpec.tagName && this.document.createElement(formatSpec.tagName);
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
                const span = this.document.createElement("span");
                span.setAttribute("data-oe-zws-empty-inline", "");
                zws.before(span);
                span.append(zws);
            }
        }

        if (selectedTextNodes[0] && selectedTextNodes[0].textContent === "\u200B") {
            this.shared.setSelection(selectedTextNodes[0], 0);
        } else if (selectedTextNodes.length) {
            const firstNode = selectedTextNodes[0];
            const lastNode = selectedTextNodes[selectedTextNodes.length - 1];
            if (direction === DIRECTIONS.RIGHT) {
                this.shared.setSelection(firstNode, 0, lastNode, lastNode.length, false);
            } else {
                this.shared.setSelection(lastNode, lastNode.length, firstNode, 0, false);
            }
        }
    }
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
            const newNode = this.document.createElement("span");
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

registry.category("phoenix_plugins").add(FormatPlugin.name, FormatPlugin);
