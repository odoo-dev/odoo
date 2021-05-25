/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component } = owl;

class BooleanField extends Component {
    toggle(ev) {
        if (this.props.mode === "write") {
            this.trigger("field-changed", ev.target.checked);
        }
    }
}
BooleanField.template = "web.BooleanField";

registry.category("fields").add("boolean", BooleanField);

//------------------------------------------------------------------------------

// temp boolean type for tests
class BooleanTextField extends Component {
    toggle() {
        if (this.props.mode === "write") {
            this.trigger("field-changed", !this.props.value);
        }
    }
}
BooleanTextField.template = owl.tags.xml`
    <div class="o_boolean_field"
        t-att-class="{
            'text-secondary': props.mode === 'read',
        }"
        t-on-click.stop.prevent="toggle"
    >
        <t t-esc="props.value" />
    </div>
`;
registry.category("fields").add("boolean_text", BooleanTextField);
