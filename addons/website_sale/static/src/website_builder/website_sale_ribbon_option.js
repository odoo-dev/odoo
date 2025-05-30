import { BaseOptionComponent } from "@html_builder/core/utils";
import { onWillStart, useState } from "@odoo/owl";

export class websiteSaleRibbonOption extends BaseOptionComponent {
    static template = 'website_sale.websiteSaleRibbonOptionPlugin';
    static props = {
        loadInfo: Function,
        count: Object,
    };

    setup() {
        super.setup();

        this.state = useState({
            ribbons: [],
            ribbonEditMode: false,
        });

        onWillStart(async () => {
            this.state.ribbons = await this.props.loadInfo();
        });
    }
}
