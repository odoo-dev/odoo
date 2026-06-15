import { Component, onWillStart, plugin, proxy } from "@odoo/owl";

import { useSpreadsheetNotificationStore } from "@spreadsheet/hooks";

import * as spreadsheet from "@odoo/o-spreadsheet";
import { Spreadsheet, Model } from "@odoo/o-spreadsheet";
import { registry } from "@web/core/registry";
import { HttpPlugin } from "@web/core/network/http_plugin";

export class PublicDashboard extends Component {
    static template = "spreadsheet_dashboard.PublicDashboard";
    static components = { Spreadsheet };
    static props = {
        dataUrl: String,
        mode: { type: String, optional: true },
    };

    setup() {
        useSpreadsheetNotificationStore();
        this.http = plugin(HttpPlugin);
        this.state = proxy({
            isFilterShown: false,
        });
        onWillStart(async () => {
            await this.createModel();
        });
    }

    get showFilterButton() {
        return this.globalFilters.length > 0 && !this.state.isFilterShown;
    }

    get globalFilters() {
        if (!this.data.globalFilters || this.data.globalFilters.length === 0) {
            return [];
        }
        return this.data.globalFilters.filter((filter) => filter.value !== "");
    }

    async createModel() {
        this.data = await this.http.get(this.props.dataUrl);
        this.model = new Model(
            this.data,
            {
                mode: "dashboard",
                custom: {
                    env: this.env,
                    isFrozenSpreadsheet: true,
                },
            },
            this.data.revisions || []
        );
        if (this.env.debug) {
            // eslint-disable-next-line no-import-assign
            spreadsheet.__DEBUG__ = spreadsheet.__DEBUG__ || {};
            spreadsheet.__DEBUG__.model = this.model;
        }
    }

    toggleGlobalFilters() {
        this.state.isFilterShown = !this.state.isFilterShown;
    }
}

registry
    .category("public_components")
    .add("spreadsheet_dashboard.PublicDashboard", PublicDashboard);
