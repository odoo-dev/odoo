/** @odoo-module **/

import { Component } from "@odoo/owl";
import { useCommand } from "@web/core/commands/command_hook";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _lt } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { sprintf } from "@web/core/utils/strings";
import { formatSelection } from "../formatters";
import { standardFieldProps } from "../standard_field_props";

export class StateSelectionField extends Component {
    static template = "web.StateSelectionField";
    static components = {
        Dropdown,
        DropdownItem,
    };
    static props = {
        ...standardFieldProps,
        hideLabel: { type: Boolean, optional: true },
        withCommand: { type: Boolean, optional: true },
    };
    static defaultProps = {
        hideLabel: false,
    };

    setup() {
        this.colorPrefix = "o_status_";
        this.colors = {
            blocked: "red",
            done: "green",
        };
        if (this.props.withCommand) {
            const hotkeys = ["D", "F", "G"];
            for (const [index, [value, label]] of this.options.entries()) {
                useCommand(
                    sprintf(this.env._t("Set kanban state as %s"), label),
                    () => this.updateRecord(value),
                    {
                        category: "smart_action",
                        hotkey: "alt+" + hotkeys[index],
                        isAvailable: () => this.props.record.data[this.props.name] !== value,
                    }
                );
            }
        }
    }
    get options() {
        return this.props.record.fields[this.props.name].selection.map(([state, label]) => {
            return [state, this.props.record.data[`legend_${state}`] || label];
        });
    }
    get currentValue() {
        return this.props.record.data[this.props.name] || this.options[0][0];
    }
    get label() {
        if (
            this.props.record.data[this.props.name] &&
            this.props.record.data[`legend_${this.props.record.data[this.props.name][0]}`]
        ) {
            return this.props.record.data[`legend_${this.props.record.data[this.props.name][0]}`];
        }
        return formatSelection(this.currentValue, { selection: this.options });
    }
    get showLabel() {
        return !this.props.hideLabel;
    }

    statusColor(value) {
        return this.colors[value] ? this.colorPrefix + this.colors[value] : "";
    }

    async updateRecord(value) {
        await this.props.record.update({ [this.props.name]: value });
        const rootRecord =
            this.props.record.model.root instanceof this.props.record.constructor &&
            this.props.record.model.root;
        const isInEdition = rootRecord ? rootRecord.isInEdition : this.props.record.isInEdition;
        // We save only if we're on view mode readonly and no readonly field modifier
        if (!isInEdition) {
            return this.props.record.save();
        }
    }
}

export const stateSelectionField = {
    component: StateSelectionField,
    displayName: _lt("Label Selection"),
    supportedTypes: ["selection"],
    extractProps: ({ canEdit, options, viewType }) => ({
        hideLabel: !!options.hide_label && viewType === "list",
        withCommand: viewType === "form",
        readonly: !canEdit,
    }),
};

registry.category("fields").add("state_selection", stateSelectionField);
registry.category("fields").add("list.state_selection", stateSelectionField);
