import { Component, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";

import { Field, getPropertyFieldInfo } from "@web/views/fields/field";
import { standardWidgetProps } from "@web/views/widgets/standard_widget_props";
import { SubtaskCreate } from "./subtask_kanban_create/subtask_kanban_create";

export class SubtaskKanbanList extends Component {
    static components = {
        Field,
        SubtaskCreate,
    };
    static props = {
        ...standardWidgetProps,
        isReadonly: {
            type: Boolean,
            optional: true,
        },
    };
    static template = "project.SubtaskKanbanList";

    setup() {
        this.actionService = useService("action");
        this.orm = useService("orm");
        this.subtaskCreate = useState({
            open: false,
            name: "",
        });
        this.state = useState({
            subtasks: [],
            isLoad:true,
            prevSubtaskCount: 0,
        });
    }

    get list() {
        return this.props.record.data.child_ids;
    }

    get hasNewSubtask() {
        const currentCount = this.list.records.length;
        if (currentCount !== this.state.prevSubtaskCount) {
            this.state.prevSubtaskCount = currentCount;
            this.state.isLoad = true;
            this.filterSubtasks();
        }
        return this.state.subtasks;
    }

    filterSubtasks() {
        if (this.state.isLoad ) {
            this.state.subtasks = this.list.records.filter(
                (subtask) => !["1_done", "1_canceled"].includes(subtask.data.state)
            ).sort((a, b) => a.resId - b.resId);
            this.state.isLoad = false;
        }
    }

    get closedList() {
        return this.hasNewSubtask;
    }

    get fieldInfo() {
        return {
            state: {
                ...getPropertyFieldInfo({
                    name: "state",
                    type: "selection",
                    widget: "project_task_state_selection",
                }),
                viewType: "kanban",
            },
        };
    }

    async goToSubtask(subtask_id) {
        return this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: this.list.resModel,
            res_id: subtask_id,
            views: [[false, "form"]],
            target: "current",
            context: {
                active_id: subtask_id,
            },
        });
    }

    async onSubTaskCreated(ev) {
        this.subtaskCreate.open = true;
    }

    async _onBlur() {
        this.subtaskCreate.open = false;
    }

    async _onSubtaskCreateNameChanged(name) {
        await this.orm.create("project.task", [{
            display_name: name,
            parent_id: this.props.record.resId,
            project_id: this.props.record.data.project_id[0],
            user_ids: this.props.record.data.user_ids.resIds,
        }]);
        this.subtaskCreate.open = false;
        this.subtaskCreate.name = "";
        this.props.record.load();
    }
}

const subtaskKanbanList = {
    component: SubtaskKanbanList,
};

registry.category("view_widgets").add("subtask_kanban_list", subtaskKanbanList);
