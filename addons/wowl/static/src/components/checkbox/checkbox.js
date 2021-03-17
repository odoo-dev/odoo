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
  _id = `checkbox-comp-${CheckBox.nextId++}`;
}

CheckBox.template = "wowl.CheckBox"
CheckBox.nextId = 1
