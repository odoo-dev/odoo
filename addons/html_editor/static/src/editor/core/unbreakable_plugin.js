import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { closestBlock } from "../utils/blocks";
import { isUnbreakable } from "../utils/dom_info";

export class Unbreakable extends Plugin {
    static name = "unbreakable";
    static dependencies = ["line_break"];
    static resources = (p) => ({
        split_element_block: [{ callback: p.handleSplitUnbreakable.bind(p) }],
    });

    handleSplitUnbreakable({ targetNode, targetOffset }) {
        const firstBlock = closestBlock(targetNode);
        if (isUnbreakable(firstBlock)) {
            this.shared.insertLineBreakElement({ targetNode, targetOffset });
            return true;
        }
    }
}

registry.category("phoenix_plugins").add(Unbreakable.name, Unbreakable);
