import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isBlock } from "../utils/blocks";
import { fillEmpty } from "../utils/dom";
import { isVisible } from "../utils/dom_info";
import { splitElementUntil, splitTextNode } from "../utils/dom_split";
import { closestElement, firstLeaf, lastLeaf } from "../utils/dom_traversal";
import { setCursorStart } from "../utils/selection";
import { collapseIfZWS } from "../utils/zws";
import { prepareUpdate } from "../utils/dom_state";

export class SplitBlockPlugin extends Plugin {
    static dependencies = ["dom"];
    static name = "split_block";
    static shared = ["splitElementBlock"];

    setup() {
        this.addDomListener(this.editable, "beforeinput", this.onBeforeInput.bind(this));
    }
    handleCommand(command, payload) {
        switch (command) {
            case "SPLIT_BLOCK":
                this.splitBlock();
                break;
        }
    }

    // --------------------------------------------------------------------------
    // commands
    // --------------------------------------------------------------------------
    splitBlock() {
        let selection = this.shared.getEditableSelection();
        if (!selection) {
            return;
        }
        collapseIfZWS(this.editable, selection);
        this.dispatch("DELETE_RANGE");
        selection = this.shared.getEditableSelection();

        this.splitBlockNode({
            targetNode: selection.anchorNode,
            targetOffset: selection.anchorOffset,
        });
    }

    splitBlockNode({ targetNode, targetOffset }) {
        if (targetNode.nodeType === Node.TEXT_NODE) {
            targetOffset = splitTextNode(targetNode, targetOffset);
            targetNode = targetNode.parentElement;
        }

        for (const { callback } of this.resources["split_element_block"]) {
            if (callback({ targetNode, targetOffset })) {
                return;
            }
        }

        this.splitElementBlock({ targetNode, targetOffset });
    }

    splitElementBlock({ targetNode, targetOffset }) {
        const restore = prepareUpdate(targetNode, targetOffset);

        // @todo @phoenix: list stuff, review this.
        const listElement = targetNode.nodeName !== "LI" && targetNode.closest("LI > *");
        const elementToSplit = listElement || closestElement(targetNode, (el) => isBlock(el));

        const [beforeElement, afterElement] = splitElementUntil(
            targetNode,
            targetOffset,
            elementToSplit.parentElement
        );
        restore();
        const removeEmptyAndFill = (node) => {
            if (!isBlock(node) && !isVisible(node)) {
                const parent = node.parentElement;
                node.remove();
                removeEmptyAndFill(parent);
            } else {
                fillEmpty(node);
            }
        };
        removeEmptyAndFill(lastLeaf(beforeElement));
        removeEmptyAndFill(firstLeaf(afterElement));

        setCursorStart(afterElement);

        return afterElement;
    }

    onBeforeInput(e) {
        if (e.inputType === "insertParagraph") {
            e.preventDefault();
            this.splitBlock();
        }
    }
}

registry.category("phoenix_plugins").add(SplitBlockPlugin.name, SplitBlockPlugin);
