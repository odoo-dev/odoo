/** @odoo-module **/
import { useService } from "../core/hooks";
import { Dropdown } from "../components/dropdown/dropdown";
import { DropdownItem } from "../components/dropdown/dropdown_item";

export class SwitchCompanyMenu extends owl.Component {
  constructor() {
    super(...arguments);
    this.device = useService("device");
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
SwitchCompanyMenu.components = { Dropdown, DropdownItem };

export const switchCompanySystrayItem = {
  name: "switchCompanySystrayItem",
  Component: SwitchCompanyMenu,
  sequence: 1,
  isDisplayed(env) {
    return !env.services.device.isSmall;
  },
};
