/** @odoo-module **/
const { Component, hooks } = owl;
import { Dropdown } from "../../../components/dropdown/dropdown";
import { DropdownItem } from "../../../components/dropdown/dropdown_item";
const { useState } = hooks;
export class CustomGroupByItem extends Component {
  constructor() {
    super(...arguments);
    this.state = useState({ fieldName: this.props.fields[0].name });
  }
  onApply() {
    const field = this.props.fields.find((f) => f.name === this.state.fieldName);
    this.props.searchModel.createNewGroupBy(field);
  }
}
CustomGroupByItem.template = "wowl.CustomGroupByItem";
CustomGroupByItem.components = { DropdownItem, Dropdown };
