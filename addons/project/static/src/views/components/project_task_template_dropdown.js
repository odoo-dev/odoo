import { Component, onWillStart } from "@odoo/owl";
import { rpcBus } from "@web/core/network/rpc";
import { UPDATE_METHODS } from "@web/core/orm_service";
import { useService } from "@web/core/utils/hooks";

rpcBus.addEventListener("RPC:RESPONSE", (ev) => {
    const { model, method } = ev.detail.data.params;
    // unfortunately, templates are from the same model as tasks, so every update operation
    // on a task invalidates the template cache...
    if (["project.task"].includes(model)) {
        if (UPDATE_METHODS.includes(method)) {
            rpcBus.trigger("CLEAR-CACHES", "get_template_tasks");
        }
    }
})

export class ProjectTaskTemplateDropdown extends Component {
    static template = "project.TemplateDropdown";

    static props = {
        hotkey: {
            type: String,
            optional: true,
        },
        newButtonClasses: String,
        onCreate: Function,
        // Can be a number, false (in to-do) or undefined
        projectId: {
            type: [Number, Boolean],
            optional: true,
        },
        context: Object,
        getAdditionalContext: {
            type: Function,
            optional: true,
        },
    };
    static defaultProps = {
        hotkey: "r",
        projectId: null,
    };

    setup() {
        this.action = useService("action");
        this.orm = useService("orm");
        this.taskTemplates = [];
        onWillStart(this.onWillStart);
    }

    async onWillStart() {
        if (this.props.projectId && !this.props.context.default_is_template) {
            this.taskTemplates = await this.orm
                .cached()
                .call("project.project", "get_template_tasks", [this.props.projectId]);
        }
    }

    async createTaskFromTemplate(templateId) {
        const context = { ...this.props.context };
        if (this.props.getAdditionalContext) {
            Object.assign(context, this.props.getAdditionalContext());
        }
        this.action.switchView("form", {
            resId: await this.orm.call(
                "project.task",
                "action_create_from_template",
                [templateId],
                {
                    context: context,
                }
            ),
            focusTitle: true,
        });
    }
}
