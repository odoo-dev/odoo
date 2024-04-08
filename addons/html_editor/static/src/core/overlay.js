import { Component, useExternalListener, xml } from "@odoo/owl";
import { usePosition } from "@web/core/position/position_hook";

export class EditorOverlay extends Component {
    static template = xml`
        <div t-ref="root" class="overlay position-absolute">
            <t t-component="props.Component" t-props="props.props"/>
        </div>`;

    static props = {
        target: { validate: (el) => el.nodeType === Node.ELEMENT_NODE, optional: true },
        config: Object,
        Component: Function,
        props: { type: Object, optional: true },
        editable: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
    };

    setup() {
        let getTarget, position;
        if (this.props.target) {
            getTarget = () => this.props.target;
        } else {
            // target is selection
            useExternalListener(this.props.editable.ownerDocument, "selectionchange", () => {
                position.unlock();
            });
            getTarget = this.getCurrentRect.bind(this);
        }
        position = usePosition("root", getTarget, this.props.config);
    }
    getCurrentRect() {
        const doc = this.props.editable.ownerDocument;
        const selection = doc.getSelection();
        if (!selection || !selection.rangeCount) {
            return null;
        }
        const focusNode = selection.focusNode;
        const range = selection.getRangeAt(0);
        let rect = range.getBoundingClientRect();
        if (rect.x === 0 && rect.width === 0 && rect.height === 0) {
            const clonedRange = range.cloneRange();
            const shadowCaret = doc.createTextNode("|");
            clonedRange.insertNode(shadowCaret);
            clonedRange.selectNode(shadowCaret);
            rect = clonedRange.getBoundingClientRect();
            shadowCaret.remove();
            clonedRange.detach();
        }
        // not proud of this...
        if (focusNode.nodeType === Node.TEXT_NODE) {
            focusNode.getBoundingClientRect = () => rect;
        }
        return focusNode;
    }
}
