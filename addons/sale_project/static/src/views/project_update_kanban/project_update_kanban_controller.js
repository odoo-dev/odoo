import { patch } from "@web/core/utils/patch";
import { useSetupAction } from "@web/search/action_hook";
import { ProjectUpdateKanbanController } from "@project/views/project_update_kanban/project_update_kanban_controller";

export function projectUpdateControllerStatePersistancePatch() {
    return {
        /**
         * @override
         */
        setup() {
            super.setup();
            this.prevSectionState = this.props?.state?.sectionState || {};
            useSetupAction({
                getLocalState: () => {
                    const val = this.rootRef.el.querySelectorAll("tr td button.fa-caret-down");
                    const sectionState = new Object();
                    val.forEach((node) => {
                        Object.assign(sectionState, { [node.closest("tr").id]: true });
                    });
                    return { sectionState: sectionState };
                },
            });
        },
    };
}

patch(ProjectUpdateKanbanController.prototype, projectUpdateControllerStatePersistancePatch());
