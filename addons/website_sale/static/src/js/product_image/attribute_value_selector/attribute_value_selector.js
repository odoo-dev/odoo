import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { x2ManyCommands } from "@web/core/orm_service";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useState } from "@web/owl2/utils";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class AttributeValueSelector extends Component {
    static template = "website_sale.attribute_value_selector";
    static components = { Dropdown, DropdownItem };
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            attribute_value_mapping: [],
            selectedValues: new Set(),
        });

        this.dropdownState = useDropdownState();
    }

    get badgeLabel() {
        const record = this.props.record;
        return (
            record._parentRecord?.resModel === "product.template"
            && record.fields.image_type.selection.find(([key]) => key === record.data.image_type)?.[1]
        ) || "";
    }

    get showDropdown() {
        const parentRecord = this.props.record._parentRecord;
        return !!parentRecord.resId && parentRecord.data.product_variant_count > 1;
    }

    get selectedCount() {
        return this.props.record.data[this.props.name].count || 0;
    }

    async beforeOpen() {
        this.state.attribute_value_mapping = await this.orm.call(
            "product.template",
            "get_attribute_value_mapping",
            [this.props.record.data.product_tmpl_id.id],
        );

        this.state.selectedValues = new Set(this.props.record.data[this.props.name].currentIds);
    }

    async toggleValue(valueId) {
        const selectedValues = this.state.selectedValues;
        const isSelected = selectedValues.has(valueId);

        isSelected ? selectedValues.delete(valueId) : selectedValues.add(valueId);
    }

    onDropdownStateChanged(isOpen) {
        if (!isOpen) {
            const initialValues = this.props.record.data[this.props.name].currentIds || [];
            const finalValues = [...this.state.selectedValues];

            if (
                initialValues.length === finalValues.length
                && initialValues.every(value => finalValues.includes(value))
            ) {
                return;
            };

            this.props.record.update({
                [this.props.name]: [
                    x2ManyCommands.set(finalValues),
                ],
            });
        }
    }
}

const attributeValueSelector = { component: AttributeValueSelector };

registry.category("fields").add("attribute_value_selector", attributeValueSelector);
