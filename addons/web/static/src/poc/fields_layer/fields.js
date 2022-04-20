/** @odoo-module **/

import { registry } from "@web/core/registry";
import { CheckBox } from "@web/core/checkbox/checkbox";

const { Component, xml } = owl;

const fieldsRegistry = registry.category("newFields");

class BooleanField extends Component {}
BooleanField.components = { CheckBox };
BooleanField.template = xml/*xml*/ `
    <CheckBox
        value="props.value"
        disabled="props.readonly"
    />
`;

fieldsRegistry.add("boolean", BooleanField);

class BooleanToggleField extends Component {}
BooleanToggleField.components = { CheckBox };
BooleanToggleField.template = xml/*xml*/ `
    <CheckBox
        className="'o_field_boolean o_boolean_toggle'"
        value="props.value"
        disabled="props.readonly"
    >
        &#8203; <!-- Zero width space needed to set height -->
        <i class="fa" t-att-class="props.value ? 'fa-check-circle' : 'fa-times-circle'" />
    </CheckBox>
`;

fieldsRegistry.add("boolean_toggle", BooleanToggleField);

class CharField extends Component {}
CharField.template = xml/*xml*/ `
    <t t-if="props.readonly">
        <span t-esc="props.value || ''" />
    </t>
    <t t-else="">
        <input type="text" t-att-value="props.value || ''" t-att-placeholder="props.placeholder" />
    </t>
`;

fieldsRegistry.add("char", CharField);

class IntegerField extends Component {}
IntegerField.template = xml/*xml*/ `
    <t t-if="props.readonly">
        <span t-esc="props.value || ''" />
    </t>
    <t t-else="">
        <input type="text" t-att-value="props.value || ''" />
    </t>
`;

fieldsRegistry.add("integer", IntegerField);

class SelectionField extends Component {}
SelectionField.template = xml/*xml*/ `
    <t t-if="props.readonly">
        <span t-esc="props.value || ''" />
    </t>
    <t t-else="">
        <select>
            <t t-foreach="props.options" t-as="option" t-key="option[0]">
                <option t-att-value="option[0]" t-esc="option[1]" t-att-selected="option[0] === props.value" />
            </t>
        </select>
    </t>
`;

fieldsRegistry.add("selection", SelectionField);
