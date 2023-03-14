/** @odoo-module **/

import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("menu_tour", {
    test: true,
    url: "/menu/?pos_id=3",
    steps: [
        {
            content: "Open Employees app",
            trigger: "button:contains('View Menu')",
        },
    ],
});
