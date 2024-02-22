import { getActiveHotkey } from "@web/core/hotkeys/hotkey_service";
import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock } from "../utils/blocks";
import { nextLeaf, previousLeaf } from "../utils/dom_info";
import { closestElement } from "../utils/dom_traversal";
import { nodeSize } from "../utils/position";

export class ZwsPlugin extends Plugin {
    static name = "zws";
    static dependencies = ["selection"];

    setup() {
        this.addDomListener(this.editable, "keydown", (ev) => {
            const hotkey = getActiveHotkey(ev);
            switch (hotkey) {
                case "arrowright":
                    this.moveRight();
                    break;
                case "shift+arrowright":
                    this.moveRight(true);
                    break;
                case "arrowleft":
                    this.moveLeft();
                    break;
                case "shift+arrowleft":
                    this.moveLeft(true);
                    break;
            }
        });
    }

    handleCommand(command, payload) {
        switch (command) {
            case "CLEAN":
                this.clean(payload);
                break;
        }
    }

    clean(element) {
        for (const el of element.querySelectorAll("[data-oe-zws-empty-inline]")) {
            el.remove();
        }
    }

    moveRight(hasShift) {
        // todo @phoenix: before they call this.clean if hasShift. Maybe we should do the same ?
        let { anchorNode, anchorOffset, focusNode, focusOffset } =
            this.shared.getEditableSelection();
        // @todo phoenix: in the original code, they check if it s a code element, and if it is, they add a zws after it.
        // Find next character.
        let nextCharacter = focusNode.textContent[focusOffset];
        if (!nextCharacter) {
            focusNode = nextLeaf(focusNode);
            focusOffset = 0;
            nextCharacter = focusNode.textContent[focusOffset];
        }
        // Move selection if next character is zero-width space
        if (
            nextCharacter === "\u200B" &&
            !focusNode.parentElement.hasAttribute("data-o-link-zws")
        ) {
            focusOffset += 1;
            let newFocusNode = focusNode;
            while (
                newFocusNode &&
                (!newFocusNode.textContent[focusOffset] ||
                    !closestElement(newFocusNode).isContentEditable)
            ) {
                newFocusNode = nextLeaf(newFocusNode);
                focusOffset = 0;
            }
            if (!focusOffset && closestBlock(focusNode) !== closestBlock(newFocusNode)) {
                newFocusNode = focusNode; // Do not move selection to next block.
                focusOffset = nodeSize(focusNode);
            }

            this.shared.setSelection({
                anchorNode: hasShift ? anchorNode : newFocusNode,
                anchorOffset: hasShift ? anchorOffset : focusOffset,
                focusNode: newFocusNode,
                focusOffset,
            });
        }
    }

    moveLeft(hasShift) {
        // todo @phoenix: before they call this.clean if hasShift. Maybe we should do the same ?

        let { anchorNode, anchorOffset, focusNode, focusOffset } =
            this.shared.getEditableSelection();

        // @todo phoenix: in the original code, they check if it s a code element, and if it is, they add a zws before it.
        // Find previous character.
        let previousCharacter = focusOffset > 0 && focusNode.textContent[focusOffset - 1];
        if (!previousCharacter) {
            focusNode = previousLeaf(focusNode);
            focusOffset = nodeSize(focusNode);
            previousCharacter = focusNode.textContent[focusOffset - 1];
        }
        // Move selection if previous character is zero-width space
        if (
            previousCharacter === "\u200B" &&
            !focusNode.parentElement.hasAttribute("data-o-link-zws")
        ) {
            focusOffset -= 1;
            while (focusNode && (focusOffset < 0 || !focusNode.textContent[focusOffset])) {
                focusNode = nextLeaf(focusNode);
                focusOffset = focusNode && nodeSize(focusNode);
            }
            this.shared.setSelection({
                anchorNode: hasShift ? anchorNode : focusNode,
                anchorOffset: hasShift ? anchorOffset : focusOffset,
                focusNode: focusNode,
                focusOffset,
            });
        }
    }
}

registry.category("phoenix_plugins").add(ZwsPlugin.name, ZwsPlugin);
