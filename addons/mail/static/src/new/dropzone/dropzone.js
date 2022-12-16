/* @odoo-module */

import { Component, useExternalListener, useRef, useState } from "@odoo/owl";

export class Dropzone extends Component {
    static props = { ref: Object, onDrop: { type: Function, optional: true } };
    static template = "mail.dropzone";

    setup() {
        this.root = useRef("root");
        this.dragCount = 0;
        this.state = useState({
            isDraggingFile: false,
            isDraggingInside: false,
            top: 0,
            left: 0,
            width: 0,
            height: 0,
        });
        useExternalListener(document, "dragenter", this.startDrag);
        useExternalListener(document, "dragleave", this.stopDrag);

        // Prevents the browser to open or download the file when it is dropped
        // outside of the dropzone.
        useExternalListener(window, "dragover", (ev) => ev.preventDefault());
        useExternalListener(window, "drop", (ev) => {
            ev.preventDefault();
            this.dragCount = 0;
        });
    }

    startDrag(ev) {
        if (this.dragCount === 0) {
            const el = this.props.ref.el;
            if (el && ev.dataTransfer && ev.dataTransfer.types.includes("Files")) {
                const { top, left, width, height } = this.props.ref.el.getBoundingClientRect();
                Object.assign(this.state, { top, left, width, height });
                this.state.isDraggingFile = true;
            }
        }
        this.dragCount++;
    }

    stopDrag(ev) {
        this.dragCount--;
        if (this.dragCount === 0) {
            this.state.isDraggingFile = false;
        }
    }

    onDragEnter() {
        this.state.isDraggingInside = true;
    }

    onDragLeave() {
        this.state.isDraggingInside = false;
    }

    onDrop(ev) {
        this.stopDrag();
        this.props.onDrop(ev);
    }
}
