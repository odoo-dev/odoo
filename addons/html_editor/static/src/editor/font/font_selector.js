import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class FontSelector extends Component {
    static template = "html_editor.FontSelector";
    static props = {
        dispatch: Function,
        getSelection: Function,

        getItems: Function,
        getSelectedName: Function,
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        this.items = this.props.getItems();
    }

    get fontName() {
        return this.props.getSelectedName(this.props.getSelection, this.items);
    }

    dispatch(cmd, payload) {
        this.props.dispatch(cmd, payload);
    }
}
