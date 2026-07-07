import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";
import { registry } from "@web/core/registry";
import { computed, props, t } from "@odoo/owl";

import { STATUS_COLORS, STATUS_COLOR_PREFIX } from "../../utils/project_utils";

export class ProjectStatusWithColorSelectionField extends SelectionField {
    projectStatusWithColorSelectionProps = props({
        hideIcon: t.boolean().optional(),
        hideValue: t.boolean().optional(),
        initialPadding: t.string().optional("2"),
    });

    static template = "project.ProjectStatusWithColorSelectionField";

    setup() {
        super.setup();
        this.colorPrefix = STATUS_COLOR_PREFIX;
        this.colors = STATUS_COLORS;
    }

    currentValue = computed(() => this.props.record.data[this.props.name] || this.options[0][0]);
    statusColor = computed(
        () => {
            const currentValue = this.currentValue();
            const color = this.colors[currentValue];
            return color ? this.colorPrefix + color : "";
        }
    );
}

export const projectStatusWithColorSelectionField = {
    ...selectionField,
    component: ProjectStatusWithColorSelectionField,
    extractProps: (fieldInfo, dynamicInfo) => {
        const props = selectionField.extractProps(fieldInfo, dynamicInfo);
        props.hideIcon = Boolean(fieldInfo.attrs.hide_icon);
        props.hideValue = Boolean(fieldInfo.attrs.hide_value);
        props.initialPadding = fieldInfo.attrs.initial_padding;
        return props;
    },
};

registry.category("fields").add("status_with_color", projectStatusWithColorSelectionField);
