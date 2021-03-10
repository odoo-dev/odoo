/** @odoo-module **/
import { useService } from "../../core/hooks";
import { DropdownItem } from "../../components/dropdown/dropdown_item";
import { Dropdown } from "../../components/dropdown/dropdown";
import { systrayRegistry } from "../systray_registry";

const { Component } = owl;

export class UserMenu extends Component {
  constructor() {
    super(...arguments);
    this.user = useService("user");
    const { origin } = odoo.browser.location;
    const { userId } = this.user;
    this.source = `${origin}/web/image?model=res.users&field=image_128&id=${userId}`;
  }

  getElements() {
    const sortedItems = odoo.userMenuRegistry
      .getAll()
      .map((element) => element(this.env))
      .sort((x, y) => {
        const xSeq = x.sequence ? x.sequence : 100;
        const ySeq = y.sequence ? y.sequence : 100;
        return xSeq - ySeq;
      });
    return sortedItems;
  }

  onDropdownItemSelected(ev) {
    ev.detail.payload.callback();
  }

  onClickOnTagA(ev) {
    if (!ev.ctrlKey) {
      ev.preventDefault();
    }
  }
}
UserMenu.template = "wowl.UserMenu";
UserMenu.components = { Dropdown, DropdownItem };

systrayRegistry.add("wowl.user_menu", UserMenu, { sequence: 0 });
