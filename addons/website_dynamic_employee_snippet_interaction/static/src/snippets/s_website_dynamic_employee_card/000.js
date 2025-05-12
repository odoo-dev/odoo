import { renderToElement } from "@web/core/utils/render";
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

export class DynamicEmployeeCard extends Interaction {
    static selector = ".s_website_dynamic_employee_card";
    dynamicContent = {
        ".s_website_dynamic_employee_card_load_more_btn": {
            "t-on-click": this.loadMore,
        },
    };

    async setup() {
        this.orm = this.services.orm;
        this.limit = 6;
    }

    async willStart() {
        this.domain = [["active", "=", true]];

        if (this.el.dataset.department) {
            this.domain.push([
                "department_id",
                "=",
                parseInt(this.el.dataset.department),
            ]);
        }
        this.employeeCount = await this.waitFor(
            this.orm.searchCount("hr.employee", this.domain)
        );
        await this.fetchData();
    }

    async start() {
        await this.renderTemplate();
    }

    async loadMore() {
        this.limit += 6;
        await this.fetchData();
        await this.renderTemplate();
    }

    async renderTemplate() {
        if (this.employees) {
            const employeeCardElement = await renderToElement(
                this.el.dataset.view_type == "list"
                    ? "website_dynamic_employee_snippet_interaction.dynamic_employee_list"
                    : "website_dynamic_employee_snippet_interaction.dynamic_employee_card",
                { employees: this.employees }
            );
            const replaceableElement = this.el.querySelector(".container");
            // replaceableElement?.replaceWith(employeeCardElement);
            this.el.replaceChild(employeeCardElement, replaceableElement);

            if (
                !this.el.querySelector(
                    ".s_website_dynamic_employee_card_load_more_btn"
                ) &&
                this.limit < this.employeeCount
            ) {
                const loadMoreBtn = await renderToElement(
                    "website_dynamic_employee_snippet_interaction.s_website_dynamic_employee_card_load_more_btn"
                );
                this.el.appendChild(loadMoreBtn);
            }
            if (this.limit > this.employeeCount) {
                this.el
                    .querySelector(
                        ".s_website_dynamic_employee_card_load_more_btn"
                    )
                    ?.remove();
            }
        }
    }
    async fetchData() {
        this.employees = await this.waitFor(
            this.orm.searchRead(
                "hr.employee",
                this.domain,
                [
                    "id",
                    "name",
                    "image_1920",
                    "job_title",
                    "work_email",
                    "work_phone",
                ],
                { limit: this.limit, offset: this.offset }
            )
        );
    }
}

registry
    .category("public.interactions")
    .add(
        "website_dynamic_employee_snippet_interaction.dynamic_employee_card",
        DynamicEmployeeCard
    );
registry
    .category("public.interactions.edit")
    .add("website_dynamic_employee_snippet_interaction.dynamic_employee_card", {
        Interaction: DynamicEmployeeCard,
    });
