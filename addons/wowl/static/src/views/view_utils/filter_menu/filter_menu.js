/** @odoo-module **/
const { Component } = owl;
import { Dropdown } from "../../../components/dropdown/dropdown";
import { DropdownItem } from "../../../components/dropdown/dropdown_item";
import { FACET_ICONS } from "../../view_utils/search_utils";
export class FilterMenu extends Component {
  constructor() {
    super(...arguments);
    this.icon = FACET_ICONS.filter;
    this.title = this.env._t("Filters");
  }
  get items() {
    return this.props.searchModel.getSearchItems((searchItem) =>
      ["filter", "dateFilter"].includes(searchItem.type)
    );
  }
  onDropdownItemSelected(ev) {
    const { itemId, optionId } = ev.detail.payload;
    if (optionId) {
      this.props.searchModel.toggleDateFilter(itemId, optionId);
    } else {
      this.props.searchModel.toggleSearchItem(itemId);
    }
  }
}
FilterMenu.template = "wowl.FilterMenu";
FilterMenu.components = { Dropdown, DropdownItem };
