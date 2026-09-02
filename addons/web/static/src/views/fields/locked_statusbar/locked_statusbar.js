import { t, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { statusBarField, StatusBarField } from "@web/views/fields/statusbar/statusbar_field";

export class LockedStatusBarField extends StatusBarField {
    static template = "web.LockedStatusBarField";

    props = useProps({
        ...standardFieldProps,
        domain: t.or([t.array(), t.function()]).optional(),
        foldField: t.string().optional(),
        isDisabled: t.boolean().optional(),
        visibleSelection: t.array(t.string()).optional(),
        withCommand: t.boolean().optional(),
        context: t.object().optional(),
        lockedStates: t.array().optional([]),
    });

    get isLocked() {
        return this.props.record.data.is_locked;
    }

    get currentItem() {
        return this.getAllItems().find((item) => item.isSelected);
    }

    shouldShowLock(item) {
        return this.props.lockedStates.includes(item.value) && item.isSelected;
    }
}

export const lockedStatusBarField = {
    ...statusBarField,
    component: LockedStatusBarField,
    displayName: _t("Status bar with lock/unlock indicator"),
    supportedTypes: ["selection"],
    additionalClasses: ["o_field_statusbar"],
    supportedOptions: [
        {
            label: _t("Locked states"),
            name: "lockedStates",
            type: "array",
        },
    ],
    extractProps(args, dynamicInfo) {
        return {
            ...statusBarField.extractProps(args, dynamicInfo),
            lockedStates: args.options.lockedStates || [],
        };
    },
};

registry.category("fields").add("locked_statusbar", lockedStatusBarField);
