/** @odoo-module **/
const { hooks } = owl;
import { NavBar } from "@wowl/webclient/navbar/navbar";
import { useService } from "@wowl/core/hooks";

const { useRef } = hooks;
export class EnterpriseNavBar extends NavBar {
  constructor() {
    super(...arguments);
    this.actionManager = useService("action");
    this.device = useService("device");
    this.hm = useService("home_menu");
    this.menuAppsRef = useRef("menuApps");
    this.menuBrand = useRef('menuBrand');
    this.appSubMenus = useRef('appSubMenus');
    hooks.onMounted(() => {
      this.env.bus.on("HOME-MENU:TOGGLED", this, () => this._updateMenuAppsIcon());
    });
    hooks.onPatched(() => {
      this._updateMenuAppsIcon();
    });
  }
  get currentApp() {
    return !this.device.isMobileOS ? super.currentApp : undefined;
  }
  get hasBackgroundAction() {
    return this.hm.hasBackgroundAction;
  }
  get isInApp() {
    return !this.hm.hasHomeMenu;
  }
  _updateMenuAppsIcon() {
    const menuAppsEl = this.menuAppsRef.el;
    menuAppsEl.classList.toggle("o_hidden", !this.isInApp && !this.hasBackgroundAction);
    menuAppsEl.classList.toggle("fa-th", this.isInApp);
    menuAppsEl.classList.toggle("fa-chevron-left", !this.isInApp && this.hasBackgroundAction);

    const menuBrand = this.menuBrand.el;
    if (menuBrand) {
      menuBrand.classList.toggle('o_hidden', !this.isInApp);
    }

    const appSubMenus = this.appSubMenus.el;
    if (appSubMenus) {
      appSubMenus.classList.toggle('o_hidden', !this.isInApp);
    }
  }
}
EnterpriseNavBar.template = "wowl.EnterpriseNavBar";
