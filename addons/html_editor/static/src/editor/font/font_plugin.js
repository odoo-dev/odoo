import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { fillEmpty, setTagName } from "../utils/dom";
import { isVisibleTextNode } from "../utils/dom_info";
import { closestElement, descendants } from "../utils/dom_traversal";
import { convertNumericToUnit, getCSSVariableValue, getHtmlStyle } from "../utils/formatting";
import { FontSelector } from "./font_selector";

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

const fontSizeItems = [
    {
        variableName: "display-1-font-size",
        className: "display-1-fs",
    },
    { variableName: "display-2-font-size", className: "display-2-fs" },
    { variableName: "display-3-font-size", className: "display-3-fs" },
    { variableName: "display-4-font-size", className: "display-4-fs" },
    { variableName: "h1-font-size", className: "h1-fs" },
    { variableName: "h2-font-size", className: "h2-fs" },
    { variableName: "h3-font-size", className: "h3-fs" },
    { variableName: "h4-font-size", className: "h4-fs" },
    { variableName: "h5-font-size", className: "h5-fs" },
    { variableName: "h6-font-size", className: "h6-fs" },
    { variableName: "font-size-base", className: "base-fs" },
    { variableName: "small-font-size", className: "o_small-fs" },
];

export class FontPlugin extends Plugin {
    static name = "font";
    static dependencies = ["split_block", "selection"];
    static resources = (p) => ({
        split_element_block: [
            { callback: p.handleSplitBlockPRE.bind(p) },
            { callback: p.handleSplitBlockHeading.bind(p) },
        ],
        toolbarGroup: [
            {
                id: "font",
                sequence: 10,
                buttons: [
                    {
                        id: "font",
                        Component: FontSelector,
                        props: {
                            getItems: () => fontItems,
                            command: "SET_TAG",
                        },
                    },
                ],
            },
            {
                id: "font-size",
                sequence: 29,
                buttons: [
                    {
                        id: "font-size",
                        Component: FontSelector,
                        props: {
                            getItems: () => p.fontSizeItems,
                            isFontSize: true,
                            command: "FORMAT_FONT_SIZE_CLASSNAME",
                            document: p.document,
                        },
                    },
                ],
            },
        ],
    });

    get fontSizeItems() {
        const style = getHtmlStyle(this.document);
        const nameAlreadyUsed = new Set();
        return fontSizeItems.flatMap((item) => {
            const strValue = getCSSVariableValue(item.variableName, style);
            if (!strValue) {
                return [];
            }
            const remValue = parseFloat(strValue);
            const pxValue = convertNumericToUnit(remValue, "rem", "px", style);
            const roundedValue = Math.round(pxValue);
            if (nameAlreadyUsed.has(roundedValue)) {
                return [];
            }
            nameAlreadyUsed.add(roundedValue);

            return [{ ...item, tagName: "span", name: roundedValue }];
        });
    }

    // @todo @phoenix: Move this to a specific Pre/CodeBlock plugin?
    /**
     * Specific behavior for pre: insert newline (\n) in text or insert p at
     * end.
     */
    handleSplitBlockPRE({ targetNode, targetOffset }) {
        if (targetNode.tagName === "PRE") {
            if (targetOffset < targetNode.childNodes.length) {
                const lineBreak = this.document.createElement("br");
                targetNode.insertBefore(lineBreak, targetNode.childNodes[targetOffset]);
                this.shared.setCursorEnd(lineBreak);
            } else {
                const node = this.document.createElement("p");
                targetNode.parentNode.insertBefore(node, targetNode.nextSibling);
                fillEmpty(node);
                this.shared.setCursorStart(node);
            }
            return true;
        }
    }

    // @todo @phoenix: Move this to a specific Heading plugin?
    /**
     * Specific behavior for headings: do not split in two if cursor at the end but
     * instead create a paragraph.
     * Cursor end of line: <h1>title[]</h1> + ENTER <=> <h1>title</h1><p>[]<br/></p>
     * Cursor in the line: <h1>tit[]le</h1> + ENTER <=> <h1>tit</h1><h1>[]le</h1>
     */
    handleSplitBlockHeading(params) {
        const headingTags = ["H1", "H2", "H3", "H4", "H5", "H6"];
        const closestHeading = closestElement(params.targetNode, (element) =>
            headingTags.includes(element.tagName)
        );
        if (closestHeading) {
            const newElement = this.shared.splitElementBlock(params);
            // @todo @phoenix: if this condition can be anticipated before the split,
            // handle the splitBlock only in such case.
            if (
                headingTags.includes(newElement.tagName) &&
                !descendants(newElement).some(isVisibleTextNode)
            ) {
                const p = setTagName(newElement, "P");
                p.replaceChildren(this.document.createElement("br"));
                this.shared.setCursorStart(p);
            }
            return true;
        }
    }
}

registry.category("phoenix_plugins").add(FontPlugin.name, FontPlugin);
