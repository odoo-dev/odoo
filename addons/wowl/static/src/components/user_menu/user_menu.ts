import { Component } from "@odoo/owl";
import { useService } from "../../core/hooks";
import { OdooEnv, SystrayItem } from "../../types";
import { Dropdown } from "../dropdown/dropdown";

export class UserMenu extends Component<{}, OdooEnv> {
  static template = "wowl.UserMenu";
  static components = { Dropdown };
  user = useService("user");
}

export const userMenuItem: SystrayItem = {
  name: "wowl.user_menu",
  Component: UserMenu,
  sequence: 0,
};
