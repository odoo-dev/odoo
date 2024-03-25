import { Component, useExternalListener, useState } from "@odoo/owl";
import { useOverlay } from "../core/overlay_plugin";

export class TablePicker extends Component {
    static template = "html_editor.TablePicker";
    static props = {
        dispatch: Function,
        el: {
            validate: (el) => el.nodeType === Node.ELEMENT_NODE,
        },
    };

    setup() {
        this.overlay = useOverlay("root", { position: "bottom" });
        this.state = useState({
            cols: 3,
            rows: 3,
        });
        useExternalListener(document, "mousedown", (ev) => {
            this.overlay.close();
        });
        useExternalListener(this.props.el, "keydown", (ev) => {
            const key = ev.key;
            switch (key) {
                case "Escape":
                    this.props.close();
                    break;
                case "Enter":
                    ev.preventDefault();
                    this.insertTable();
                    break;
                case "ArrowUp":
                    ev.preventDefault();
                    if (this.state.rows > 1) {
                        this.state.rows -= 1;
                    }
                    break;
                case "ArrowDown":
                    this.state.rows += 1;
                    ev.preventDefault();
                    break;
                case "ArrowLeft":
                    ev.preventDefault();
                    if (this.state.cols > 1) {
                        this.state.cols -= 1;
                    }
                    break;
                case "ArrowRight":
                    this.state.cols += 1;
                    ev.preventDefault();
                    break;
            }
        });
    }

    updateSize(cols, rows) {
        this.state.cols = cols;
        this.state.rows = rows;
    }

    insertTable() {
        this.props.dispatch("INSERT_TABLE", { cols: this.state.cols, rows: this.state.rows });
        this.overlay.close();
    }
}
