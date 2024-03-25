import { Component } from "@odoo/owl";
import { useOverlay } from "../core/overlay_plugin";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class TableMenu extends Component {
    static template = "html_editor.TableMenu";
    static props = {
        position: String,
        dispatch: Function,
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        this.overlay = useOverlay("root", {
            position: this.props.position,
            offsetY: 0,
            width: "auto",
        });
    }

    items = [
        {
            name: "delete",
            icon: "fa-trash",
            text: "Delete",
            action: this.deleteColumn.bind(this),
        },
    ];

    onSelected(item) {
        item.action(this.overlay.target);
        this.overlay.close();
    }

    deleteColumn(target) {
        this.props.dispatch("REMOVE_COLUMN", { cell: target });
    }
}
