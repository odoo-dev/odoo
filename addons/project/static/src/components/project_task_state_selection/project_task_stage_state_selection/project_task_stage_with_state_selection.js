import { Component, props, t } from "@odoo/owl";

import { registry } from "@web/core/registry";
import { computeM2OProps, Many2One } from "@web/views/fields/many2one/many2one";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

import { ProjectTaskStateSelection } from "../project_task_state_selection";

export class TaskStageWithStateSelection extends Component {
    static template = "project.TaskStageWithStateSelection";
    static components = {
        ProjectTaskStateSelection,
        Many2One,
    };

    props = props({
        ...standardFieldProps,
        viewType: t.string(),
    });

    get stageProps() {
        return computeM2OProps(this.props);
    }

    get stateProps() {
        return {
            ...this.props,
            name: "state",
            showLabel: false,
        };
    }
}

export const taskStageWithStateSelection = {
    component: TaskStageWithStateSelection,
    fieldDependencies: [{ name: "state", type: "selection" }],
    supportedTypes: ["many2one"],
    extractProps({ viewType }) {
        return {
            viewType,
        };
    },
};

registry.category("fields").add("task_stage_with_state_selection", taskStageWithStateSelection);
