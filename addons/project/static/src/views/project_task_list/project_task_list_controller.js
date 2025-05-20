import { ListController } from "@web/views/list/list_controller";
import { subTaskDeleteConfirmationMessage } from "@project/views/project_task_form/project_task_form_controller";

import { ProjectTaskTemplateDropdown } from "../components/project_task_template_dropdown";

export class ProjectTaskListController extends ListController {
    static template = "project.ProjectTaskListView";
    static components = {
        ...ListController.components,
        ProjectTaskTemplateDropdown,
    };

    async getDeleteConfirmationDialogProps() {
        const deleteConfirmationDialogProps = await super.getDeleteConfirmationDialogProps();
        const hasSubtasks = this.model.root.selection.some(task => task.data.subtask_count > 0)
        if (!hasSubtasks) {
            return deleteConfirmationDialogProps;
        }
        return {
            ...deleteConfirmationDialogProps,
            body: subTaskDeleteConfirmationMessage,
        }
    }
}
