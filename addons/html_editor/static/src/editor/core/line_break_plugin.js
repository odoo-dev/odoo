/** @odoo-module */

import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { CTYPES } from "../utils/content_types";
import { splitTextNode } from "../utils/dom_split";
import { getState, isFakeLineBreak, prepareUpdate } from "../utils/dom_state";
import { DIRECTIONS, leftPos, rightPos } from "../utils/position";
import { setSelection } from "../utils/selection";
import { collapseIfZWS } from "../utils/zws";

export class LineBreakPlugin extends Plugin {
    static dependencies = ["dom"];
    static name = "line_break";

    setup() {
        this.addDomListener(this.editable, "beforeinput", this.onBeforeInput.bind(this));
    }
    handleCommand(command, payload) {
        switch (command) {
            case "INSERT_LINEBREAK":
                this.insertLineBreak();
                break;
        }
    }

    insertLineBreak() {
        let selection = this.shared.getEditableSelection();
        if (!selection) {
            return;
        }
        collapseIfZWS(this.editable, selection);
        this.dispatch("DELETE_RANGE");
        selection = this.shared.getEditableSelection();

        let anchorNode = selection.anchorNode;
        let anchorOffset = selection.anchorOffset;

        if (anchorNode.nodeType === Node.TEXT_NODE) {
            anchorOffset = splitTextNode(anchorNode, anchorOffset);
            anchorNode = anchorNode.parentElement;
        }

        const restore = prepareUpdate(anchorNode, anchorOffset);

        const brEl = document.createElement("br");
        const brEls = [brEl];
        if (anchorOffset >= anchorNode.childNodes.length) {
            anchorNode.appendChild(brEl);
        } else {
            anchorNode.insertBefore(brEl, anchorNode.childNodes[anchorOffset]);
        }
        if (
            isFakeLineBreak(brEl) &&
            getState(...leftPos(brEl), DIRECTIONS.LEFT).cType !== CTYPES.BR
        ) {
            const brEl2 = document.createElement("br");
            brEl.before(brEl2);
            brEls.unshift(brEl2);
        }

        restore();

        const anchor = brEls[0].parentElement;
        // @todo @phoenix should this case be handled by a LinkPlugin?
        // @todo @phoenix Don't we want this for all spans ?
        if (anchor.nodeName === "A" && brEls.includes(anchor.firstChild)) {
            brEls.forEach((br) => anchor.before(br));
            setSelection(...rightPos(brEls[brEls.length - 1]));
        } else if (anchor.nodeName === "A" && brEls.includes(anchor.lastChild)) {
            brEls.forEach((br) => anchor.after(br));
            setSelection(...rightPos(brEls[0]));
        } else {
            for (const el of brEls) {
                if (el.parentNode) {
                    setSelection(...rightPos(el));
                    break;
                }
            }
        }
    }

    onBeforeInput(e) {
        if (e.inputType === "insertParagraph") {
            e.preventDefault();
            this.insertLineBreak();
        }
    }
}

registry.category("phoenix_plugins").add(LineBreakPlugin.name, LineBreakPlugin);
