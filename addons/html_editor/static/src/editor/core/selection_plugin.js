import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = ["getEditableSelection", "getEditableSelectionStatic"];

    getEditableSelection() {
        const selection = this.document.getSelection();
        if (selection.rangeCount === 0) {
            return;
        }
        if (
            this.editable.contains(selection.anchorNode) &&
            (selection.focusNode === selection.anchorNode ||
                this.editable.contains(selection.focusNode))
        ) {
            return selection;
        }
    }

    getEditableSelectionStatic() {
        const selection = this.document.getSelection();
        return {
            anchorNode: selection.anchorNode,
            anchorOffset: selection.anchorOffset,
            focusNode: selection.focusNode,
            focusOffset: selection.focusOffset,
        };
    }
}

registry.category("phoenix_plugins").add(SelectionPlugin.name, SelectionPlugin);
