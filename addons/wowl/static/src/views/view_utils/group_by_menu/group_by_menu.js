/** @odoo-module **/
const { Component } = owl;
import { Dropdown } from "../../../components/dropdown/dropdown";
import { DropdownItem } from "../../../components/dropdown/dropdown_item";
import { CustomGroupByItem } from "./custom_group_by_item";
import { FACET_ICONS, GROUPABLE_TYPES } from "../search_utils";
export class GroupByMenu extends Component {
  constructor() {
    super(...arguments);
    this.icon = FACET_ICONS.groupBy;
    this.title = this.env._t("Group By");
    this.fields = [];
    for (const fieldName in this.props.searchModel.fields) {
      const field = this.props.searchModel.fields[fieldName];
      if (this.validateField(fieldName, field)) {
        this.fields.push(Object.assign({ name: fieldName }, field));
      }
    }
    this.fields.sort(({ string: a }, { string: b }) => (a > b ? 1 : a < b ? -1 : 0));
  }
  get items() {
    return this.props.searchModel.getSearchItems((searchItem) =>
      ["groupBy", "dateGroupBy"].includes(searchItem.type)
    );
  }
  validateField(fieldName, field) {
    const { type, sortable } = field;
    return fieldName !== "id" && sortable && GROUPABLE_TYPES.includes(type);
  }
  onDropdownItemSelected(ev) {
    const { itemId, optionId } = ev.detail.payload;
    if (optionId) {
      this.props.searchModel.toggleDateGroupBy(itemId, optionId);
    } else {
      this.props.searchModel.toggleSearchItem(itemId);
    }
  }
}
GroupByMenu.template = "wowl.GroupByMenu";
GroupByMenu.components = { DropdownItem, Dropdown, CustomGroupByItem };
