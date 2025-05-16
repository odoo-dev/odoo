
import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

export class UoMSelector extends Component {
    static template = "sale.UoMSelector";
    static props = {
        product_tmpl_id: Number,
        uom_id: Number,
        uom_data: Object,
    };

    async selectUoM(event) {
        // FIXME VFE VCR this.product_tmpl_id is always the main product id, why?????
        this.env.setUoM(this.props.product_tmpl_id, parseInt(event.target.value));
    }

    getTitle() {
        return _t("Packaging");
    }
}
