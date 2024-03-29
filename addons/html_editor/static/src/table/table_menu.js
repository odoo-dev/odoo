import { Component } from "@odoo/owl";
import { useOverlay } from "../core/overlay_plugin";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";

export class TableMenu extends Component {
    static template = "html_editor.TableMenu";
    static props = {
        type: String, // column or row
        dispatch: Function,
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        const position = this.props.type === "column" ? "top" : "left";
        const auto = this.props.type === "column" ? "width" : "height";
        this.overlay = useOverlay("root", {
            position: position,
            offsetY: 0,
            [auto]: "auto",
        });
        if (this.props.type === "column") {
            this.isFirst = this.overlay.target.cellIndex === 0;
            this.isLast = !this.overlay.target.nextElementSibling;
        } else {
            const tr = this.overlay.target.parentElement;
            this.isFirst = !tr.previousElementSibling;
            this.isLast = !tr.nextElementSibling;
        }
        this.items = this.props.type === "column" ? this.colItems() : this.rowItems();
    }

    onSelected(item) {
        item.action(this.overlay.target);
        this.overlay.close();
    }

    colItems() {
        return [
            !this.isFirst && {
                name: "move_left",
                icon: "fa-chevron-left disabled",
                text: _t("Move left"),
                action: this.moveColumn.bind(this, "left"),
            },
            !this.isLast && {
                name: "move_right",
                icon: "fa-chevron-right",
                text: _t("Move right"),
                action: this.moveColumn.bind(this, "right"),
            },
            {
                name: "insert_left",
                icon: "fa-plus",
                text: _t("Insert left"),
                action: this.insertColumn.bind(this, "before"),
            },
            {
                name: "insert_right",
                icon: "fa-plus",
                text: _t("Insert right"),
                action: this.insertColumn.bind(this, "after"),
            },
            {
                name: "delete",
                icon: "fa-trash",
                text: _t("Delete"),
                action: this.deleteColumn.bind(this),
            },
        ].filter(Boolean);
    }

    rowItems() {
        return [
            !this.isFirst && {
                name: "move_up",
                icon: "fa-chevron-up",
                text: _t("Move up"),
                action: this.moveRow.bind(this, "up"),
            },
            !this.isLast && {
                name: "move_down",
                icon: "fa-chevron-down",
                text: _t("Move down"),
                action: this.moveRow.bind(this, "down"),
            },
            {
                name: "insert_above",
                icon: "fa-plus",
                text: _t("Insert above"),
                action: this.insertRow.bind(this, "before"),
            },
            {
                name: "insert_below",
                icon: "fa-plus",
                text: _t("Insert below"),
                action: this.insertRow.bind(this, "after"),
            },
            {
                name: "delete",
                icon: "fa-trash",
                text: _t("Delete"),
                action: this.deleteRow.bind(this),
            },
        ].filter(Boolean);
    }

    moveColumn(position, target) {
        this.props.dispatch("MOVE_COLUMN", { position, cell: target });
    }

    insertColumn(position, target) {
        this.props.dispatch("ADD_COLUMN", { position, reference: target });
    }

    deleteColumn(target) {
        this.props.dispatch("REMOVE_COLUMN", { cell: target });
    }

    moveRow(position, target) {
        this.props.dispatch("MOVE_ROW", { position, row: target.parentElement });
    }

    insertRow(position, target) {
        this.props.dispatch("ADD_ROW", { position, reference: target.parentElement });
    }

    deleteRow(target) {
        this.props.dispatch("REMOVE_ROW", { row: target.parentElement });
    }
}
