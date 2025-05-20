import { _t } from "@web/core/l10n/translation";
import { CalendarController } from "@web/views/calendar/calendar_controller";
import { subTaskDeleteConfirmationMessage } from "@project/views/project_task_form/project_task_form_controller";
import { ProjectTaskCalendarSidePanel } from "./project_task_calendar_side_panel";

export class ProjectTaskCalendarController extends CalendarController {
    static components = {
        ...ProjectTaskCalendarController.components,
        CalendarSidePanel: ProjectTaskCalendarSidePanel,
    };

    get editRecordDefaultDisplayText() {
        return _t("New Task");
    }

    async getDeleteConfirmationDialogProps(record) {
        const deleteConfirmationDialogProps = await super.getDeleteConfirmationDialogProps(record);
        if  (!record.rawRecord.subtask_count) {
            return deleteConfirmationDialogProps;
        }

        return {
            ...deleteConfirmationDialogProps,
            body: subTaskDeleteConfirmationMessage,
        }
    }
}
