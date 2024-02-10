import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

export class SelectionPlugin extends Plugin {
    static name = "selection";
    static shared = ["getEditableSelection"];

    setup() {
        this.activeSelection = this.makeSelection(false, false);
    }

    makeSelection(selection, inEditor) {
        let range;
        if (!selection || !selection.rangeCount) {
            selection = false;
            range = new Range();
            range.setStart(this.editable, 0);
            range.setEnd(this.editable, 0);
        } else {
            range = selection.getRangeAt(0);
        }
        const isCollapsed = selection && selection.isCollapsed;

        const anchorNode = selection ? selection.anchorNode : range.startContainer;
        const anchorOffset = selection ? selection.anchorOffset : range.startOffset;
        let startContainer, startOffset, endContainer, endOffset;
        const focusNode = selection ? selection.focusNode : range.endContainer;
        const focusOffset = selection ? selection.focusOffset : range.endOffset;

        this.lastAnchorOffset = anchorOffset;
        this.lastFocusOffset = focusOffset;

        let isStartContainer = anchorNode === range.startContainer;
        if (anchorNode === focusNode && focusOffset <= anchorOffset) {
            isStartContainer = false;
        }

        if (isStartContainer) {
            [startContainer, startOffset] = [anchorNode, anchorOffset];
            [endContainer, endOffset] = [focusNode, focusOffset];
        } else {
            [startContainer, startOffset] = [focusNode, focusOffset];
            [endContainer, endOffset] = [anchorNode, anchorOffset];
        }

        const activeSelection = {
            anchorNode,
            anchorOffset,
            focusNode,
            focusOffset,
            startContainer,
            startOffset,
            endContainer,
            endOffset,
            commonAncestorContainer: range.commonAncestorContainer,
            isCollapsed,
            inEditor,
        };

        Object.freeze(activeSelection);
        return activeSelection;
    }

    getEditableSelection() {
        const selection = this.document.getSelection();
        if (
            selection.rangeCount &&
            this.editable.contains(selection.anchorNode) &&
            (selection.focusNode === selection.anchorNode ||
                this.editable.contains(selection.focusNode))
        ) {
            this.activeSelection = this.makeSelection(selection, true);
        }
        return this.activeSelection;
    }
}

registry.category("phoenix_plugins").add(SelectionPlugin.name, SelectionPlugin);
