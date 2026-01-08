import { Component, useState } from '@odoo/owl';
import { Dropdown } from '@web/core/dropdown/dropdown';
import { useDropdownState } from '@web/core/dropdown/dropdown_hooks';
import { DropdownItem } from '@web/core/dropdown/dropdown_item';
import { x2ManyCommands } from "@web/core/orm_service";
import { registry } from '@web/core/registry';
import { useService } from '@web/core/utils/hooks';

export class ProductImage extends Component {
    static template = 'variant_image_assignment';
    static components = { Dropdown, DropdownItem };
    static props = {
        id: String,
        name: String,
        readonly: Boolean,
        record: Object,
    };

    setup() {
        this.orm = useService('orm');
        this.record = this.props.record;
        this.state = useState({
            attributes: [],
            checkedIds: new Set(),
        });

        this.dropdownState = useDropdownState();
    }

    get showDropdown() {
        const parent = this.record._parentRecord;
        if (!parent.resId) {
            return false;
        }
        return parent.data.product_variant_count > 1
    }

    get selectedCount() {
        return this.record.data[this.props.name].count || 0;
    }

    async beforeOpen() {
        const productTmplId = this.record.data.product_tmpl_id.id || this.record.context.active_id;

        this.state.attributes = await this.orm.call(
            'product.template',
            'get_attribute_values_for_image_assignment',
            [productTmplId],
        );

        this.state.checkedIds = new Set(this.record.data[this.props.name].currentIds);
    }

    async toggleValue(valueId) {
        const checkedIds = this.state.checkedIds;
        const isChecked = checkedIds.has(valueId);

        isChecked ? checkedIds.delete(valueId) : checkedIds.add(valueId);

        this.record.update({
          [this.props.name]: [
            isChecked
              ? x2ManyCommands.unlink(valueId)
              : x2ManyCommands.link(valueId),
          ],
        });
    }
}

const productImage = { component: ProductImage };

registry.category('fields').add('variant_image_assignment', productImage);
