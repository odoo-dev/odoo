import { Component } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { Dropdown } from "../../components/dropdown/dropdown";
import { DropdownItem } from "../../components/dropdown/dropdown_item";
import { useService } from "../../core/hooks";
import { OdooEnv } from "../../types";
import { SystrayItem } from "../systray_registry";

type Callback = () => void | Promise<any>;
interface UserMenuItem {
  description: string;
  callback: Callback;
  hide?: boolean;
  href?: string;
  sequence?: number;
}

export type UserMenuItemFactory = (env: OdooEnv) => UserMenuItem;

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
    const { origin } = odoo.browser.location;
    const { userId } = this.user;
    this.source = `${origin}/web/image?model=res.users&field=image_128&id=${userId}`;
  }

  getItemGroups(): UserMenuItem[][] {
    const filteredItems = [];
    for (const itemFactory of odoo.userMenuRegistry.getAll()) {
      const item = itemFactory(this.env);
      const { hide } = item;
      if (!hide) {
        filteredItems.push(item);
      }
    }
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
    ev.detail.payload.callback();
  }

  onClickOnTagA(ev: MouseEvent) {
    if (!ev.ctrlKey) {
      ev.preventDefault();
    }
  }
}

export const userMenu: SystrayItem = {
  name: "wowl.user_menu",
  Component: UserMenu,
  sequence: 0,
};
