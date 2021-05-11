/** @odoo-module **/

import { SearchModel } from "./search_model";

const { Component } = owl;

export class SearchComponent extends Component {
    setup() {
        if (!(this.env.searchModel instanceof SearchModel)) {
            throw new Error("A SearchModel instance in env is required");
        }
    }
}
