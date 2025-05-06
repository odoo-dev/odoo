import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class employeeDetails extends Interaction {
    static selector = ".s_employee_details";

    async willStart() {
        const departmentId = parseInt(this.el.dataset.departmentId);
        let domain = [];
        if (departmentId) {
            domain.push(["department_id", "=", departmentId]);
        }
        this.result = await this.waitFor(this.services.orm.searchRead(
            "hr.employee",
            domain,
            ["name", "department_id", "job_title", "work_email", "image_1920"]
        ));
    }

    start() {
        if (this.result) {
            const layout = this.el.dataset.layout || "card";
            const templateEl = this.renderAt(
                layout === "card" ? "website_hr_employee.s_employee_details_dynamic_card" : "website_hr_employee.s_employee_details_dynamic_list",
                { records: this.result }
            );
            this.el.replaceChildren(...templateEl);
        }
    }
}

registry
    .category("public.interactions")
    .add("website_hr_employee.employee_details", employeeDetails);

registry
    .category("public.interactions.edit")
    .add("website_hr_employee.employee_details", {
        Interaction: employeeDetails
    });
