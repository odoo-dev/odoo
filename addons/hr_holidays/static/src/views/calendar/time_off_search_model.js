import { SearchModel } from "@web/search/search_model";
import { user } from "@web/core/user";

export class TimeOffReportCalendarSearchModel extends SearchModel {

    async load(config) {
        if (
            config.resModel !== "hr.leave.report.calendar" ||
            !config.context?.hide_employee_name
        ) {
            return super.load(config);
        }

        const employees = await this.orm.searchRead(
            "hr.employee",
            [["active", "=", true]],
            ["child_ids", "user_id"],
        );

        if (employees.length < 50) {
            return super.load(config);
        }

        const currentEmployee = employees.find(
            (emp) => emp.user_id[0] === user.userId
        );

        const hasSubordinates = currentEmployee?.child_ids?.length > 0;

        return super.load({
            ...config,
            context: {
                ...config.context,
                search_default_my_team: hasSubordinates ? 1 : 0,
                search_default_department: hasSubordinates ? 0 : 1,
            },
        });
    }
}

// import { SearchModel } from "@web/search/search_model";

// export class TimeOffReportCalendarSearchModel extends SearchModel {
//     async load(config) {
//         if (
//             config.resModel !== "hr.leave.report.calendar" ||
//             !config.context?.hide_employee_name
//         ) {
//             return super.load(config);
//         }

//         const extraContext = await this.orm.call(
//             "hr.leave.report.calendar",
//             "get_overview_action_context",
//             []
//         );

//         return super.load({
//             ...config,
//             context: {
//                 ...config.context,
//                 ...extraContext,
//             },
//         });
//     }
// }