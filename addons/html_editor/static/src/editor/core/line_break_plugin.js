import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { CTYPES } from "../utils/content_types";
import { splitTextNode } from "../utils/dom_split";
import { getState, isFakeLineBreak, prepareUpdate } from "../utils/dom_state";
import { DIRECTIONS, leftPos, rightPos } from "../utils/position";
import { collapseIfZWS } from "../utils/zws";

export class LineBreakPlugin extends Plugin {
    static dependencies = ["selection"];
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
        if (!selection.isCollapsed) {
            collapseIfZWS(this.editable, selection);
            this.dispatch("DELETE_RANGE");
        }
        selection = this.shared.getEditableSelection();

        let anchorNode = selection.anchorNode;
        let anchorOffset = selection.anchorOffset;

        if (anchorNode.nodeType === Node.TEXT_NODE) {
            anchorOffset = splitTextNode(anchorNode, anchorOffset);
            anchorNode = anchorNode.parentElement;
        }

        const restore = prepareUpdate(anchorNode, anchorOffset);

        const brEl = this.document.createElement("br");
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
            const brEl2 = this.document.createElement("br");
            brEl.before(brEl2);
            brEls.unshift(brEl2);
        }

        restore();

        const anchor = brEls[0].parentElement;
        // @todo @phoenix should this case be handled by a LinkPlugin?
        // @todo @phoenix Don't we want this for all spans ?
        if (anchor.nodeName === "A" && brEls.includes(anchor.firstChild)) {
            brEls.forEach((br) => anchor.before(br));
            const pos = rightPos(brEls[brEls.length - 1]);
            this.shared.setSelection({ anchorNode: pos[0], anchorOffset: pos[1] });
        } else if (anchor.nodeName === "A" && brEls.includes(anchor.lastChild)) {
            brEls.forEach((br) => anchor.after(br));
            const pos = rightPos(brEls[0]);
            this.shared.setSelection({ anchorNode: pos[0], anchorOffset: pos[1] });
        } else {
            for (const el of brEls) {
                // @todo @phoenix we don t want to setSelection multiple times
                if (el.parentNode) {
                    const pos = rightPos(el);
                    this.shared.setSelection({ anchorNode: pos[0], anchorOffset: pos[1] });
                    break;
                }
            }
        }
    }

    onBeforeInput(e) {
        if (e.inputType === "insertLineBreak") {
            e.preventDefault();
            this.insertLineBreak();
        }
    }
}

registry.category("phoenix_plugins").add(LineBreakPlugin.name, LineBreakPlugin);
