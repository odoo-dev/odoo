/** @odoo-module **/

import { useService } from "../core/hooks";

export class SwitchCompanyMenu extends owl.Component {
  constructor() {
    super(...arguments);
    this.ui = useService("ui");
    this.user = useService("user");
  }
  toggleCompany(companyId) {
    this.user.setCompanies("toggle", companyId);
  }
  logIntoCompany(companyId) {
    this.user.setCompanies("loginto", companyId);
  }
}
SwitchCompanyMenu.template = "wowl.SwitchCompanyMenu";

export const switchCompanySystrayItem = {
  name: "switchCompanySystrayItem",
  Component: SwitchCompanyMenu,
  sequence: 1,
  isDisplayed(env) {
    return !env.services.ui.isSmall;
  },
};
