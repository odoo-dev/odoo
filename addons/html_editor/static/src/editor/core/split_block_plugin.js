import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isBlock } from "../utils/blocks";
import { fillEmpty } from "../utils/dom";
import { isVisible } from "../utils/dom_info";
import { splitElementUntil, splitTextNode } from "../utils/dom_split";
import { closestElement, firstLeaf, lastLeaf } from "../utils/dom_traversal";
import { collapseIfZWS } from "../utils/zws";
import { prepareUpdate } from "../utils/dom_state";

export class SplitBlockPlugin extends Plugin {
    static dependencies = ["selection"];
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
        if (!selection.isCollapsed) {
            collapseIfZWS(this.editable, selection);
            this.dispatch("DELETE_RANGE");
        }
        selection = this.shared.getEditableSelection();

        this.splitBlockNode({
            targetNode: selection.anchorNode,
            targetOffset: selection.anchorOffset,
        });
        this.dispatch("ADD_STEP");
    }

    splitBlockNode({ targetNode, targetOffset }) {
        if (targetNode.nodeType === Node.TEXT_NODE) {
            targetOffset = splitTextNode(targetNode, targetOffset);
            targetNode = targetNode.parentElement;
        }
        const blockToSplit = closestElement(targetNode, isBlock);

        for (const { callback } of this.resources["split_element_block"]) {
            if (callback({ targetNode, targetOffset, blockToSplit })) {
                return;
            }
        }

        this.splitElementBlock({ targetNode, targetOffset, blockToSplit });
    }

    splitElementBlock({ targetNode, targetOffset, blockToSplit }) {
        this.dispatch("CLEAN_BEFORE_SPLIT_BLOCK", blockToSplit);

        const restore = prepareUpdate(targetNode, targetOffset);

        const [beforeElement, afterElement] = splitElementUntil(
            targetNode,
            targetOffset,
            blockToSplit.parentElement
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

        this.shared.setCursorStart(afterElement);

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
