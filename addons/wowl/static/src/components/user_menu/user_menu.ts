import { Component } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { useService } from "../../core/hooks";
import { Stringifiable } from "../../core/localization";
import { OdooEnv, SystrayItem } from "../../types";
import { Dropdown } from "../dropdown/dropdown";
import { DropdownItem } from "../dropdown/dropdown_item";

type Callback = (env: OdooEnv) => void | Promise<any>;

export interface UserMenuItem {
  description: Stringifiable;
  callback: Callback;
  isVisible?: (env: OdooEnv) => boolean;
  sequence?: number;
}

interface Detail {
  payload: {
    callback: Callback;
  };
}

export class UserMenu extends Component<{}, OdooEnv> {
  static template = "wowl.UserMenu";
  static components = { Dropdown, DropdownItem };
  source: string;
  user = useService("user");

  constructor() {
    super(...arguments);
    const { origin } = this.env.browser.location;
    const { userId } = this.user;
    this.source = `${origin}/web/image?model=res.users&field=image_128&id=${userId}`;
  }

  getItemGroups(): UserMenuItem[][] {
    const filteredItems = this.env.registries.userMenu.getAll().filter((item) => {
      return item.isVisible ? item.isVisible(this.env) : true;
    });
    const sortedItems = filteredItems.sort((x, y) => {
      return (x.sequence ?? 100) - (y.sequence ?? 100);
    });
    const groups: UserMenuItem[][] = [[], []];
    for (const item of sortedItems) {
      const groupIndex = (item.sequence ?? 100) < 40 ? 0 : 1;
      groups[groupIndex].push(item);
    }
    return groups;
  }

  onDropdownItemSelected(ev: OwlEvent<Detail>) {
    ev.detail.payload.callback(this.env);
  }
}

export const userMenu: SystrayItem = {
  name: "wowl.user_menu",
  Component: UserMenu,
  sequence: 0,
};
