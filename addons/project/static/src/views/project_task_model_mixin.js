import { browser } from "@web/core/browser/browser";
import { router } from "@web/core/browser/router";
import { Domain } from "@web/core/domain";

export const ProjectTaskModelMixin = (T) => class ProjectTaskModelMixin extends T {
    _processSearchDomain(domain) {
        const { my_tasks, subtask_action, activity_action } = this.env.searchModel.globalContext;
        const showSubtasksKey = router.current.action === "project_sharing" ? "portalShowSubTasks" : "showSubtasks";
        const showSubtasks = (my_tasks || subtask_action || activity_action || JSON.parse(browser.localStorage.getItem(showSubtasksKey))) ?? true;
        if (!showSubtasks) {
            domain = Domain.and([
                domain,
                [['display_in_project', '=', true]],
            ]).toList({});
        }
        if (this.env.searchModel.context?.render_task_templates) {
            domain = Domain.and([
                Domain.removeDomainLeaves(domain, ['has_template_ancestor']).toList(),
                [['has_template_ancestor', '=', true]],
            ]).toList({});
        }
        return domain;
    }
}
