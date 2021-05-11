/** @odoo-module **/

import { SearchComponent } from "../search_component";

const { useState } = owl.hooks;

export class CustomGroupByItem extends SearchComponent {
    setup() {
        super.setup();
        this.state = useState({});
        if (this.props.fields.length) {
            this.state.fieldName = this.props.fields[0].name;
        }
    }

    onApply() {
        this.env.searchModel.createNewGroupBy(this.state.fieldName);
    }
}

CustomGroupByItem.template = "wowl.CustomGroupByItem";
