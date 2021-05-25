/** @odoo-module **/

import { registry } from "@web/core/registry";

const { Component } = owl;

class One2ManyField extends Component {}
One2ManyField.template = "web.One2ManyField";

registry.category("fields").add("one2many", One2ManyField);
