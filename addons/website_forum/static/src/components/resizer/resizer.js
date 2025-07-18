import { Component, onMounted, useExternalListener } from "@odoo/owl";

export class Resizer extends Component {
    static template = "website_forum.Resizer";
    static props = {
        getTargetRef: Function,
        initialHeight: Number,
        minHeight: Number,
    };

    setup() {
        this.targetRef;
        this.mouseDownOnResizer = false;
        this.startOffsetTop;
        this.startHeight;
        onMounted(() => {
            this.targetRef = this.props.getTargetRef();
            this.setHeight(this.props.initialHeight);
        });
        useExternalListener(document, "mousemove", this.onMouseMove.bind(this));
        useExternalListener(document, "mouseup", this.onMouseUp.bind(this));
    }

    getHeight() {
        return this.targetRef.el.offsetHeight;
    }

    setHeight(value) {
        this.targetRef.el.style.height = `${value}px`;
    }

    onResizerMouseDown(ev) {
        this.mouseDownOnResizer = true;
        this.startHeight = this.getHeight();
        this.startOffsetTop = ev.pageY;
    }

    onMouseMove(ev) {
        if (!this.mouseDownOnResizer) {
            return;
        }
        const offsetTop = ev.pageY - this.startOffsetTop;
        const newHeight = Math.max(this.startHeight + offsetTop, this.props.minHeight);
        this.setHeight(newHeight);
    }

    onMouseUp() {
        this.mouseDownOnResizer = false;
    }
}
