import { Plugin } from "@html_editor/plugin";
import { wrapInlinesInBlocks } from "@html_editor/utils/dom";
import { isParagraphRelatedElement, isPhrasingContent } from "@html_editor/utils/dom_info";
import { childNodes } from "@html_editor/utils/dom_traversal";
import { registry } from "@web/core/registry";

export class EmptyMailingPlugin extends Plugin {
    static id = "EmptyMailing";
    static dependencies = ["selection"];

    resources = {
        normalize_handlers: this.normalize.bind(this),
    };

    normalize() {
        const wrapperTd = this.editable.querySelector(".o_mail_wrapper_td");
        if (!wrapperTd) {
            return;
        }
        const nodes = childNodes(wrapperTd);
        const invalidNodeGroupsAtRoot = [];
        let invalidNodes = [];
        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.match(/^(?:\r\n|\r|\n)/)) {
                node.remove();
            }
            if (isPhrasingContent(node) || isParagraphRelatedElement(node)) {

                invalidNodes.push(node);
            } else if (invalidNodes.length > 0) {
                invalidNodeGroupsAtRoot.push(invalidNodes);
                invalidNodes = [];
            }
        }
        if (invalidNodes.length > 0) {
            invalidNodeGroupsAtRoot.push(invalidNodes);
        }
        let textSnippet;
        for (const group of invalidNodeGroupsAtRoot) {
            textSnippet = this.config.snippetModel
                .getSnippetByName("snippet_structure", "s_text_block")
                .content.cloneNode(true);
            group[0].before(textSnippet);
            const container = textSnippet.querySelector(".container");
            container.replaceChildren(...group);
            wrapInlinesInBlocks(container);
        }
    }
}

registry.category("mass_mailing-plugins").add(EmptyMailingPlugin.id, EmptyMailingPlugin);
