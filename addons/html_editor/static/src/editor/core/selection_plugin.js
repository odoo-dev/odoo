import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = ["getEditableSelection"];

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
}

registry.category("phoenix_plugins").add(SelectionPlugin.name, SelectionPlugin);
