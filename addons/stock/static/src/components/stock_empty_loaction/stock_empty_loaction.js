import { registry } from "@web/core/registry";
import { Component } from "@odoo/owl";
import { computeM2OProps, Many2One } from "@web/views/fields/many2one/many2one";
import { buildM2OFieldDescription, Many2OneField } from "@web/views/fields/many2one/many2one_field";

export class StockLocationMany2One extends Many2One {
    get many2XAutocompleteProps() {
        const props = super.many2XAutocompleteProps;
        props.specification = {
            ...props.specification,
            is_empty: {},
        };
        return props;
    }
}

export class StockLocationMany2OneField extends Component {
    static template = "stock.Many2OneStockLocationField";
    static components = { StockLocationMany2One };
    static props = Many2OneField.props;

    get m2oProps() {
        return computeM2OProps(this.props);
    }
}

registry.category("fields").add("many2one_empty_location", {
    ...buildM2OFieldDescription(StockLocationMany2OneField),
});
