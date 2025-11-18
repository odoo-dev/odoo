import { Component } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class HrPresenceStatus extends Component {
    static template = "hr.HrPresenceStatus";
    static props = {
        ...standardFieldProps,
    };

    get classNames() {
        return `o_employee_availability fa ${this.icon} fa-fw o_button_icon hr_presence align-middle ${this.color}`;
    }

    get color() {
        switch (this.value) {
            case "presence_present":
                return "text-success";
            case "presence_absent":
                return "o_icon_employee_absent";
            case "presence_out_of_working_hour":
            case "presence_archive":
                return "text-muted";
            default:
                return "";
        }
    }

    get icon() {
        return `fa-circle${this.value.startsWith("presence_archive") ? "-o" : ""}`;
    }

    get label() {
        return this.value !== false
            ? this.options.find(([value, label]) => value === this.value)[1]
            : "";
    }

    get options() {
        return this.props.record.fields[this.props.name].selection.filter(
            (option) => option[0] !== false && option[1] !== ""
        );
    }

    get value() {
        return this.props.record.data[this.props.name];
    }
}

export const hrPresenceStatus = {
    component: HrPresenceStatus,
    fieldDependencies: [],
    displayName: _t("HR Presence Status"),
};

registry.category("fields").add("hr_presence_status", hrPresenceStatus)
