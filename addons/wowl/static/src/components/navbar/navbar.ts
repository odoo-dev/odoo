import { Component, hooks } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { useService } from "../../core/hooks";
import { MenuTree } from "../../services/menus";
import { OdooEnv } from "../../types";
import { Dropdown } from "../dropdown/dropdown";
import { DropdownItem } from "../dropdown/dropdown_item";

export interface NavBarState {
  selectedApp: null | MenuTree;
}

export class NavBar extends Component<{}, OdooEnv> {
  static template = "wowl.NavBar";
  static components = { Dropdown, DropdownItem };
  actionManager = useService("action_manager");
  menuRepo = useService("menus");

  constructor(...args: any[]) {
    super(...args);
    hooks.onMounted(() => {
      this.env.bus.on("MENUS:APP-CHANGED", this, () => this.render());
    });
  }

  systrayItems = this._getSystrayItems();

  _getSystrayItems() {
    return this.env.registries.systray.getAll().sort((x, y) => {
      const xSeq = x.sequence ?? 50;
      const ySeq = y.sequence ?? 50;
      return ySeq - xSeq;
    });
  }

  onNavBarDropdownItemSelection(ev: OwlEvent<{ payload: any }>) {
    const { payload: menu } = ev.detail;
    this.menuRepo.selectMenu(menu);
  }

  get currentApp() {
    return this.menuRepo.getCurrentApp();
  }
}
