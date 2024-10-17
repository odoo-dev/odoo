import { patch } from "@web/core/utils/patch";
import { ProjectUpdateListController } from "@project/views/project_update_list/project_update_list_controller";
import { projectUpdateControllerStatePersistancePatch } from "../project_update_kanban/project_update_kanban_controller";

patch(ProjectUpdateListController.prototype, projectUpdateControllerStatePersistancePatch());
