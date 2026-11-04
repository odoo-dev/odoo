import { Component, t, useProps } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

export class CustomGroupByItem extends Component {
    static template = "web.CustomGroupByItem";
    static components = { Dropdown, DropdownItem };
    props = useProps({
        fields: t.array(),
        onAddCustomGroup: t.function(),
    });

    get choices() {
        return this.props.fields.map((f) => ({ label: f.string, value: f.name }));
    }

    onSelected(fieldName) {
        this.props.onAddCustomGroup(fieldName);
    }
}
