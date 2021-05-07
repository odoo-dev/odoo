/** @odoo-module **/

import { useService } from "../../core/service_hook";
import { systrayRegistry } from "../../core/systray_registry";

export class SwitchCompanyMenu extends owl.Component {
    static isDisplayed(env) {
        const allowedCompanies = env.services.user.allowed_companies;
        return Object.keys(allowedCompanies).length > 1 && !env.isSmall;
    }

    setup() {
        this.user = useService("user");
    }

    toggleCompany(companyId) {
        this.user.setCompanies("toggle", companyId);
    }

    logIntoCompany(companyId) {
        this.user.setCompanies("loginto", companyId);
    }
}
SwitchCompanyMenu.template = "web.SwitchCompanyMenu";

systrayRegistry.add("SwitchCompanyMenu", SwitchCompanyMenu, { sequence: 1 });
