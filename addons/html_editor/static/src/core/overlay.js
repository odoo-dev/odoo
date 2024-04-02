import { Component, xml, useRef, onMounted, onWillUnmount } from "@odoo/owl";

export class EditorOverlay extends Component {
    static template = xml`
        <div t-ref="root" class="overlay position-absolute">
            <t t-component="props.Component" t-props="props.props"/>
        </div>`;

    static props = {
        overlay: Object,
        Component: Function,
        props: { type: Object, optional: true },
        editable: { validate: (el) => el.nodeType === Node.ELEMENT_NODE },
        target: { validate: (el) => el.nodeType === Node.ELEMENT_NODE, optional: true },
    };

    setup() {
        this.ref = useRef("root");
        const overlay = this.props.overlay;
        this.config = overlay.config;
        this.offsetY = this.config.offsetY === undefined ? 6 : this.config.offsetY;
        onMounted(() => {
            overlay.component = this;
            this.updatePosition();
        });
        onWillUnmount(() => delete overlay.component);
    }

    updatePosition() {
        const el = this.ref.el;
        const elRect = this.props.editable.getBoundingClientRect();
        const overlayRect = el.getBoundingClientRect();
        // autoclose if overlay target is out of view
        const target = this.props.target
            ? this.props.target.getBoundingClientRect()
            : this.getCurrentRect();
        if (target.bottom < elRect.top - 10 || target.top > elRect.bottom + this.offsetY) {
            // position below
            this.props.overlay.close();
            return;
        }
        // auto adapt width or height if necessary
        if (this.config.width === "auto") {
            el.style.width = target.width + "px";
        }
        if (this.config.height === "auto") {
            el.style.height = target.height + "px";
        }

        if (this.config.position === "left") {
            const left = target.left - overlayRect.width;
            el.style.left = left + "px";
            el.style.top = target.top + "px";
        } else {
            let top;
            const attemptTop = target.top - this.offsetY - overlayRect.height;
            const attemptBottom = target.bottom + this.offsetY;
            if (this.config.position === "top") {
                // try position === 'top'
                top = attemptTop;
                // if top does not work and bottom does work => fallback on bottom
                if (attemptTop < elRect.top && attemptBottom + overlayRect.height < elRect.bottom) {
                    top = attemptBottom;
                }
            } else {
                // try position === "bottom"
                top = attemptBottom;
                // if bottom does not work and top does work => fallback on top
                if (attemptBottom + overlayRect.height > elRect.bottom && attemptTop > elRect.top) {
                    top = attemptTop;
                }
            }
            const left = target.left;
            el.style.left = left + "px";
            el.style.top = top + "px";
        }
    }

    getCurrentRect() {
        const doc = this.props.editable.ownerDocument;
        const selection = doc.getSelection();
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
        return rect;
    }
}
