import { makeContext } from "@web/core/context";
import { registry } from "@web/core/registry";

async function hrHolidaysSearch(env, action) {
    const nextAction = await env.services.action.loadAction(
        "hr_holidays.action_hr_holidays_dashboard"
    );
    const filters = await env.services.orm.call(
        "hr.leave.report.calendar",
        "get_overview_action_context",
        []
    );
    return {
        ...nextAction,
        context: makeContext([
            nextAction.context || {},
            action.context || {},
            filters,
        ]),
    };
}
registry.category("actions").add("hr_holidays_overview_search", hrHolidaysSearch);
