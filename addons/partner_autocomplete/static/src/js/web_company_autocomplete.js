/** @odoo-module **/

import { registry } from "@web/core/registry";
import { sessionInfo } from "@web/session";

export const companyAutocompleteService = {
    dependencies: ["orm", "company"],

    start(env, { orm, company }) {
        if (sessionInfo.iap_company_enrich) {
            const currentCompanyId = company.currentCompany.id;
            orm.silent.call("res.company", "iap_enrich_auto", [currentCompanyId], {});
        }
    },
};

registry
    .category("services")
    .add("partner_autocomplete.companyAutocomplete", companyAutocompleteService);
