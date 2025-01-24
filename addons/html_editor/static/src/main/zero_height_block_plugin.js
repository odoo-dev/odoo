import { Plugin } from "@html_editor/plugin";
import { removeClass } from "@html_editor/utils/dom";
import { isEmpty, isNotEditableNode } from "@html_editor/utils/dom_info";
import { closestElement } from "@html_editor/utils/dom_traversal";

export class ZeroHeightBlockPlugin extends Plugin {
    static id = "zeroHeightBlock";
    static dependencies = ["selection"];

    resources = {
        normalize_handlers: this.normalize.bind(this),
        selectionchange_handlers: this.onSelectionChange.bind(this),
        split_element_block_overrides: this.splitBlockOverride.bind(this),
        power_buttons_visibility_predicates: ({ anchorNode }) =>
            !closestElement(anchorNode, ".o_zero_height_block"),
        eligible_for_zhb_predicates: isNotEditableNode,
        system_classes: ["o_horizontal_cursor"],
        clean_for_save_handlers: ({ root }) => this.clearZHBs(root),
    };

    normalize(root) {
        this.transformZHBs();
        if (root !== this.editable) {
            return;
        }
        this.clearZHBs();
        this.addZHBs();
    }

    addZHBs() {
        const predicates = this.getResource("eligible_for_zhb_predicates");
        const isEligible = (block) => predicates.some((p) => p(block));
        // assuming only blocks at the root level
        const eligibleBlocks = [...this.editable.children].filter(isEligible);
        if (!eligibleBlocks.length) {
            return;
        }
        // first child
        if (!eligibleBlocks[0].previousElementSibling) {
            this.editable.prepend(this.createZHB());
        }
        // last child
        if (!eligibleBlocks.at(-1).nextElementSibling) {
            this.editable.append(this.createZHB());
        }
        // between siblings
        for (let i = 0; i < eligibleBlocks.length - 1; i++) {
            if (eligibleBlocks[i].nextElementSibling === eligibleBlocks[i + 1]) {
                eligibleBlocks[i].after(this.createZHB());
            }
        }
    }

    clearZHBs(root = this.editable) {
        // todo: preserve selection?
        root.querySelectorAll(".o_zero_height_block").forEach((p) => p.remove());
    }

    transformZHBs() {
        [...this.editable.querySelectorAll(".o_zero_height_block")]
            .filter((p) => !isEmpty(p))
            .forEach((p) => removeClass(p, "o_zero_height_block"));
    }

    createZHB() {
        const p = this.document.createElement("p");
        p.classList.add("o_zero_height_block");
        p.append(this.document.createElement("br"));
        return p;
    }

    onSelectionChange(selectionData) {
        this.clearHorizontalCursor();
        const { documentSelectionIsInEditable, editableSelection } = selectionData;
        if (!documentSelectionIsInEditable && !editableSelection.isCollapsed) {
            return;
        }
        const amazingP = closestElement(editableSelection.anchorNode, ".o_zero_height_block");
        if (amazingP) {
            amazingP.classList.add("o_horizontal_cursor");
        }
    }

    clearHorizontalCursor() {
        this.editable
            .querySelectorAll(".o_horizontal_cursor")
            .forEach((p) => removeClass(p, "o_horizontal_cursor"));
    }

    // TODO: should probably do the same thing for line break
    splitBlockOverride({ blockToSplit }) {
        if (blockToSplit.classList.contains("o_zero_height_block")) {
            removeClass(blockToSplit, "o_zero_height_block");
            return true;
        }
    }
}
