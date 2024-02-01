import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { closestBlock } from "../utils/blocks";

export class FontSelector extends Component {
    static template = "html_editor.FontSelector";
    static props = {
        dispatch: Function,
        getSelection: Function,

        getItems: Function,
    };
    static components = { Dropdown, DropdownItem };

    setup() {
        this.items = this.props.getItems();
    }

    get fontName() {
        const sel = this.props.getSelection();
        if (!sel) {
            return "Normal";
        }
        const anchorNode = sel.anchorNode;
        const block = closestBlock(anchorNode);
        const tagName = block.tagName.toLowerCase();

        const matchingItems = this.items.filter((item) => {
            return item.tagName === tagName;
        });

        if (!matchingItems.length) {
            return "Normal";
        }

        return (
            matchingItems.find((item) => block.classList.contains(item.extraClass)) ||
            matchingItems[0]
        ).name;
    }

    dispatch(cmd, payload) {
        this.props.dispatch(cmd, payload);
    }
}
