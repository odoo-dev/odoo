/** @odoo-module **/

import { Component } from "@odoo/owl";

import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

class ActivityException extends Component {
    get textClass() {
        if (this.props.value) {
            return `text-${this.props.value} fa ${this.props.record.data.activity_exception_icon}`;
        }
        return undefined;
    }
}

Object.assign(ActivityException, {
    props: standardFieldProps,
    template: "mail.ActivityException",
    fieldDependencies: {
        activity_exception_icon: { type: "char" },
    },
    noLabel: true,
});

registry.category("fields").add("activity_exception", ActivityException);
