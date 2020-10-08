import { Component } from "@odoo/owl";
import { SystrayItem } from "../../types";

export class UserMenu extends Component {
  static template = "wowl.UserMenu";
}

export const userMenuItem: SystrayItem = {
  name: "wowl.user_menu",
  Component: UserMenu,
};
