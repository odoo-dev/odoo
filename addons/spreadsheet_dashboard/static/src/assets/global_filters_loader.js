/** @odoo-module **/

import { Component, onWillStart, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { loadBundle } from "@web/core/assets";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

class GlobalFilterFieldLoader extends Component {
    static template = xml`
        <t t-if="state.Component">
            <t t-component="state.Component" t-props="props"/>
        </t>
        <t t-else="">
            <span class="text-muted">Loading global filters…</span>
        </t>
    `;
    static props = {
        ...standardFieldProps,
        dashboard: { type: String, optional: true },
    };

    setup() {
        this.state = useState({ Component: null });

        onWillStart(async () => {
            // 1️⃣ Load spreadsheet bundle
            await loadBundle("spreadsheet.o_spreadsheet");

            // 2️⃣ Dynamically import the real component
            const mod = await odoo.loader.modules.get(
                "@spreadsheet_dashboard/bundle/dashboard_action/fields/global_filter_field"
            );
            if (!mod?.GlobalFilterField) {
                throw new Error(_t("Global Filters component not found"));
            }

            this.state.Component = mod.GlobalFilterField;
        });
    }
}

registry.category("fields").add("global_filters", {
    component: GlobalFilterFieldLoader,
    displayName: _t("Global Filters"),
    supportedOptions: [
        {
            label: _t("Dashboard"),
            name: "dashboard",
            type: "string",
        },
    ],
    supportedTypes: ["json"],
    isEmpty: () => false,
    extractProps({ options }) {
        return { dashboard: options.dashboard };
    },
});
