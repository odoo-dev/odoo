import { BaseOptionComponent } from "@html_builder/core/utils";
import { onWillStart, useState } from "@odoo/owl";

export class ribbonOption extends BaseOptionComponent {
    static template = 'website_sale.ribbonOptionPlugin';
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
