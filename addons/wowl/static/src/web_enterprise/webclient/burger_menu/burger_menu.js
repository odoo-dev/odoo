/** @odoo-module **/
import { useService } from "../../../core/hooks";
import { DropdownItem } from "../../../components/dropdown/dropdown_item";
import { Dropdown } from "../../../components/dropdown/dropdown";
import { BurgerUserMenu } from "./user_menu/user_menu.";
import { MobileSwitchCompanyMenu } from "./mobile_switch_company_menu/mobile_switch_company_menu";

/**
 * This file includes the widget Menu in mobile to render the BurgerMenu which
 * opens fullscreen and displays the user menu and the current app submenus.
 */

class BurgerMenu extends owl.Component {
  constructor() {
    super(...arguments);
    this.user = useService("user");
    this.menuRepo = useService("menu");
    this.hm = useService("home_menu");
    this.state = owl.hooks.useState({
      isUserMenuOpened: false,
      isBurgerOpened: false,
    });
    owl.hooks.onMounted(() => {
      this.env.bus.on("HOME-MENU:TOGGLED", this, () => {
        this._closeBurger();
      });
      this.env.bus.on("ACTION_MANAGER:UPDATE", this, (req) => {
        if (req.id) {
          this._closeBurger();
        }
      });
    });
  }
  get currentApp() {
    return !this.hm.hasHomeMenu && this.menuRepo.getCurrentApp();
  }
  get currentAppSections() {
    return (this.currentApp && this.menuRepo.getMenuAsTree(this.currentApp.id).childrenTree) || [];
  }
  _closeBurger() {
    this.state.isUserMenuOpened = false;
    this.state.isBurgerOpened = false;
  }
  _openBurger() {
    this.state.isBurgerOpened = true;
  }
  _toggleUserMenu() {
    this.state.isUserMenuOpened = !this.state.isUserMenuOpened;
  }
  /**
   * @param {Event} ev
   */
  _onDropDownClicked(ev) {
    const dropDownToggler = ev.currentTarget.querySelector(".o_dropdown_toggler");
    const wasActive = dropDownToggler.classList.contains("o_dropdown_active");
    const toggleIcon = dropDownToggler.querySelector(".toggle_icon");
    toggleIcon.classList.toggle("fa-chevron-down", !wasActive);
    toggleIcon.classList.toggle("fa-chevron-right", wasActive);
  }
  _onMenuClicked(menu) {
    this.menuRepo.selectMenu(menu);
  }
}
BurgerMenu.template = "wowl.BurgerMenu";
BurgerMenu.components = {
  Portal: owl.misc.Portal,
  Dropdown,
  DropdownItem,
  BurgerUserMenu,
  MobileSwitchCompanyMenu,
};

export const burgerMenu = {
  name: "wowl.burger_menu",
  Component: BurgerMenu,
  sequence: 0,
  isDisplayed(env) {
    return env.services.device.isSmall;
  },
};
