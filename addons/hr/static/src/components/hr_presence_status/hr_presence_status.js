import { Component } from "@odoo/owl";

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

export class HrPresenceStatus extends Component {
    static template = "hr.HrPresenceStatus";
    static props = {
        ...standardFieldProps,
        tag: { type: String, optional: true },
    };
    static defaultProps = {
        tag: "small",
    };

    get classNames() {
        const classNames = ["fa"];
        classNames.push(
            this.icon,
            "fa-fw",
            "o_button_icon",
            "hr_presence",
            "align-middle",
            this.color,
        )
        return classNames.join(" ");
    }

    get color() {
        switch (this.value) {
            case "online":
            case "presence_present":
                return "text-success";
            case "presence_absent":
                return "o_icon_employee_absent";
            case "offline":
                return "text-700";
            case "away":
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
        if(!this.im_status) {
            return this.value !== false
            ? this.options.find(([value, label]) => value === this.value)[1]
            : "";
        }
        switch(this.status) {
            case "online":
                return "Online";
            case "offline":
                return "Offline";
            case "away":
                return "Idle";
        }
    }

    get options() {
        return this.props.record.fields[this.props.name].selection.filter(
            (option) => option[0] !== false && option[1] !== ""
        );
    }

    get value() {
        return this.props.record.data[this.props.name];
    }

    get im_status() {
        return this.props.record.data.im_status;
    }

    get status() {
        return this.im_status || this.value;
    }
}

export const hrPresenceStatus = {
    component: HrPresenceStatus,
    displayName: _t("HR Presence Status"),
    extractProps({ viewType }, dynamicInfo) {
        return {
            tag: viewType === "kanban" ? "span" : "small",
        };
    },
    fieldDependencies: [{ name: "im_status", type: "char" }],
};

registry.category("fields").add("hr_presence_status", hrPresenceStatus);
