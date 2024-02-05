import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { FontSelector } from "./font_selector";
import { _t } from "@web/core/l10n/translation";
import { setCursorEnd, setCursorStart } from "../utils/selection";
import { fillEmpty, setTagName } from "../utils/dom";
import { closestElement, descendants } from "../utils/dom_traversal";
import { isVisibleTextNode } from "../utils/dom_info";

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
    static dependencies = ["split_block"];
    static resources = (p) => ({
        split_element_block: [
            { callback: p.handleSplitBlockPRE.bind(p) },
            { callback: p.handleSplitBlockHeading.bind(p) },
        ],
        toolbarGroup: {
            id: "style",
            sequence: 10,
            buttons: [
                {
                    id: "font",
                    Component: FontSelector,
                    props: {
                        getItems: () => fontItems,
                    },
                },
            ],
        },
    });

    // @todo @phoenix: Move this to a specific Pre/CodeBlock plugin?
    /**
     * Specific behavior for pre: insert newline (\n) in text or insert p at
     * end.
     */
    handleSplitBlockPRE({ targetNode, targetOffset }) {
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
                setCursorStart(p);
            }
            return true;
        }
    }
}

registry.category("phoenix_plugins").add(FontPlugin.name, FontPlugin);
