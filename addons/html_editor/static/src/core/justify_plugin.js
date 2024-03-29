import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { getTraversedNodes } from "../utils/selection";
import { isVisibleTextNode } from "../utils/dom_info";
import { closestBlock } from "../utils/blocks";

export class JustifyPlugin extends Plugin {
    static name = "justify";
    static dependencies = ["selection"];

    handleCommand(command) {
        switch (command) {
            case "JUSTIFY_LEFT":
                this.align("left");
                break;
            case "JUSTIFY_RIGHT":
                this.align("right");
                break;
            case "JUSTIFY_CENTER":
                this.align("center");
                break;
            case "JUSTIFY_FULL":
                this.align("justify");
                break;
        }
    }

    align(mode) {
        const visitedBlocks = new Set();
        const traversedNode = getTraversedNodes(this.editable);
        for (const node of traversedNode) {
            if (isVisibleTextNode(node)) {
                const block = closestBlock(node);
                if (!visitedBlocks.has(block)) {
                    // todo @phoenix: check if it s correct in right to left ?
                    let textAlign = getComputedStyle(block).textAlign;
                    textAlign = textAlign === "start" ? "left" : textAlign;
                    if (textAlign !== mode && block.isContentEditable) {
                        block.style.textAlign = mode;
                    }
                    visitedBlocks.add(block);
                }
            }
        }
    }
}

registry.category("phoenix_plugins").add(JustifyPlugin.name, JustifyPlugin);
