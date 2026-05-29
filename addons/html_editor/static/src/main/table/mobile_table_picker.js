import { useExternalListener, useLayoutEffect } from "@web/owl2/utils";
import { Component, proxy, signal } from "@odoo/owl";

export class MobileTablePicker extends Component {
    static template = "html_editor.MobileTablePicker";
    static props = {
        insertTable: Function,
        close: Function,
        editable: {
            validate: (el) => el.nodeType === Node.ELEMENT_NODE,
        },
    };

    rowCountRef = signal(null);
    columnCountRef = signal(null);

    setup() {
        this.state = proxy({
            rowCount: 3,
            columnCount: 3,
        });
        useLayoutEffect(
            (el) => {
                if (el) {
                    el.focus();
                }
            },
            () => [this.rowCountRef()]
        );
        useExternalListener(
            this.props.editable.ownerDocument,
            "keydown",
            (ev) => {
                ev.stopPropagation();
                if (!ev.target.matches(".o-we-tablesizepopover input")) {
                    return;
                }
                switch (ev.key) {
                    case "Enter":
                        ev.preventDefault();
                        this.insertTable();
                        break;
                    case "Escape":
                        ev.preventDefault();
                        this.props.close();
                        break;
                }
            },
            { capture: true }
        );
    }

    updateSize() {
        const rowEl = this.rowCountRef();
        const colEl = this.columnCountRef();
        if (rowEl) {
            this.state.rowCount = parseInt(rowEl.value);
        }
        if (colEl) {
            this.state.columnCount = parseInt(colEl.value);
        }
    }

    insertTable() {
        if (this.state.columnCount > 0 && this.state.rowCount > 0) {
            this.props.insertTable({ cols: this.state.columnCount, rows: this.state.rowCount });
            this.props.close();
        }
    }

    onApply() {
        this.insertTable();
    }

    onDiscard() {
        this.props.close();
    }
}
