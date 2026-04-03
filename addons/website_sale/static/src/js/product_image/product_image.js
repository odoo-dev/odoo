import { Component } from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { useDropdownState } from "@web/core/dropdown/dropdown_hooks";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { x2ManyCommands } from "@web/core/orm_service";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useState } from "@web/owl2/utils";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class ProductImage extends Component {
    static template = "website_sale.variant_image_assignment";
    static components = { Dropdown, DropdownItem };
    static props = {
        ...standardFieldProps,
    };

    setup() {
        this.orm = useService("orm");
        this.state = useState({
            attributes: [],
            checkedIds: new Set(),
        });

        this.dropdownState = useDropdownState();
    }

    get badgeLabel() {
        const field = this.props.record.fields.is_primary_or_secondary;
        const formatter = registry.category("formatters").get(field.type);
        return formatter(
            this.props.record.data.is_primary_or_secondary,
            { selection: field.selection }
        );
    }

    get showDropdown() {
        const parent = this.props.record._parentRecord;
        if (!parent.resId) {
            return false;
        }
        return parent.data.product_variant_count > 1;
    }

    get selectedCount() {
        return this.props.record.data[this.props.name].count || 0;
    }

    async beforeOpen() {
        const productTmplId = this.props.record.data.product_tmpl_id.id || this.props.record.context.active_id;

        this.state.attributes = await this.orm.call(
            "product.template",
            "get_attribute_values_for_image_assignment",
            [productTmplId],
        );

        this.state.checkedIds = new Set(this.props.record.data[this.props.name].currentIds);
    }

    async toggleValue(valueId) {
        const checkedIds = this.state.checkedIds;
        const isChecked = checkedIds.has(valueId);

        isChecked ? checkedIds.delete(valueId) : checkedIds.add(valueId);

        this.props.record.update({
            [this.props.name]: [
                isChecked ? x2ManyCommands.unlink(valueId) : x2ManyCommands.link(valueId),
            ],
        });
    }
}

const productImage = { component: ProductImage };

registry.category("fields").add("variant_image_assignment", productImage);
