/** @odoo-module **/
import { UserMenu } from "../../../../webclient/user_menu/user_menu";

export class BurgerUserMenu extends UserMenu {
  _onItemClicked(callback, ev) {
    callback();
  }
}
BurgerUserMenu.template = "wowl.BurgerUserMenu";
