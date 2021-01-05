/** @odoo-module **/

const { Component } = owl;

/**
 * Custom checkbox
 *
 * <Checkbox
 *     value="boolean"
 *     disabled="boolean"
 *     text="'Change the label text'"
 *     t-on-change="_onValueChange"
 *     />
 *
 * @extends Component
 */

export class CheckBox extends Component {
  static template = "wowl.CheckBox";
  static nextId = 1;

  _id = `checkbox-comp-${CheckBox.nextId++}`;
}
