import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

/**
 * @typedef {Object} Props
 * @property {Object} action
 * @property {Boolean} isSmall
 * @property {Boolean} [isActive]
 * @extends {Component<Props, Env>}
 */
export class CallActionButton extends Component {
    static template = "discuss.CallActionList.button";
    static components = { Dropdown, DropdownItem };
    static props = ["action", "isSmall", "isActive?"];

    get title() {
        return this.props.action.hotkey
            ? `${this.props.action.name} (${this.props.action.hotkey})`
            : this.props.action.name;
    }
}
