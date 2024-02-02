import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { FontSelector } from "./font_selector";
import { _t } from "@web/core/l10n/translation";
import { closestBlock } from "../utils/blocks";
import { setCursorEnd, setCursorStart } from "../utils/selection";
import { fillEmpty } from "../utils/dom";

const fontItems = [
    {
        name: _t("Header 1 Display 1"),
        tagName: "h1",
        extraClass: "display-1",
    },
    // TODO @phoenix use them if showExtendedTextStylesOptions is true
    {
        name: _t("Header 1 Display 2"),
        tagName: "h1",
        extraClass: "display-2",
    },
    {
        name: _t("Header 1 Display 3"),
        tagName: "h1",
        extraClass: "display-3",
    },
    {
        name: _t("Header 1 Display 4"),
        tagName: "h1",
        extraClass: "display-4",
    },
    // ----

    { name: _t("Header 1"), tagName: "h1" },
    { name: _t("Header 2"), tagName: "h2" },
    { name: _t("Header 3"), tagName: "h3" },
    { name: _t("Header 4"), tagName: "h4" },
    { name: _t("Header 5"), tagName: "h5" },
    { name: _t("Header 6"), tagName: "h6" },

    { name: _t("Normal"), tagName: "p" },

    // TODO @phoenix use them if showExtendedTextStylesOptions is true
    {
        name: _t("Light"),
        tagName: "p",
        extraClass: "lead",
    },
    {
        name: _t("Small"),
        tagName: "p",
        extraClass: "small",
    },
    // ----

    { name: _t("Code"), tagName: "pre" },
    { name: _t("Quote"), tagName: "blockquote" },
];

export class FontPlugin extends Plugin {
    static name = "font";
    static resources = (p) => ({
        split_element_block: { callback: p.handleSplitBlock.bind(p) },
        toolbarGroup: {
            id: "style",
            sequence: 10,
            buttons: [
                {
                    id: "font",
                    Component: FontSelector,
                    isFormatApplied: () => false, // TODO
                    props: {
                        getItems: () => fontItems,
                        getSelectedName(getSelection, items) {
                            const sel = getSelection();
                            if (!sel) {
                                return "";
                            }
                            const anchorNode = sel.anchorNode;
                            const block = closestBlock(anchorNode);
                            const tagName = block.tagName.toLowerCase();

                            const matchingItems = items.filter((item) => {
                                return item.tagName === tagName;
                            });

                            if (!matchingItems.length) {
                                return "Normal";
                            }

                            return (
                                matchingItems.find((item) =>
                                    block.classList.contains(item.extraClass)
                                ) || matchingItems[0]
                            ).name;
                        },
                    },
                },
            ],
        },
    });

    /**
     * Specific behavior for pre: insert newline (\n) in text or insert p at
     * end.
     */
    handleSplitBlock({ targetNode, targetOffset }) {
        if (targetNode.tagName === "PRE") {
            if (targetOffset < targetNode.childNodes.length) {
                const lineBreak = document.createElement("br");
                targetNode.insertBefore(lineBreak, targetNode.childNodes[targetOffset]);
                setCursorEnd(lineBreak);
            } else {
                const node = document.createElement("p");
                targetNode.parentNode.insertBefore(node, targetNode.nextSibling);
                fillEmpty(node);
                setCursorStart(node);
            }
            return true;
        }
    }
}

registry.category("phoenix_plugins").add(FontPlugin.name, FontPlugin);
