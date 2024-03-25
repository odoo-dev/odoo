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
        useOverlay("root", {
            position: this.props.position,
            offsetY: 0,
            width: "auto",
        });
    }

    items = [
        {
            text: "Delete",
        },
    ];

    onSelected(item) {
        console.log(item);
    }
}
