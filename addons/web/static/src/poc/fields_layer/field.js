/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component, xml } = owl;

const fieldsRegistry = registry.category("newFields");

class DefaultField extends Component {}
DefaultField.template = xml``;

export class Field extends Component {
    get component() {
        return fieldsRegistry.get(this.props.type, DefaultField);
    }
}
Field.template = xml/*xml*/ `
    <div t-att-name="props.name">
        <t t-component="component" t-props="props" />
    </div>
`;
