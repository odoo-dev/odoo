/** @odoo-module **/

import { registry } from "@web/core/registry";

export const companyAutocompleteService = {
    dependencies: ["orm", "user"],

    start(env, { orm, user }) {
        if (odoo.session_info.iap_company_enrich) {
            const currentCompanyId = user.current_company.id;
            orm.call("res.company", "iap_enrich_auto", [currentCompanyId], {}, { shadow: true });
        }
    },
};

registry
    .category("services")
    .add("partner_autocomplete.companyAutocomplete", companyAutocompleteService);
