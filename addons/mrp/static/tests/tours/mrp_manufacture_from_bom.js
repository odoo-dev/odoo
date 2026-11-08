import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_manufacture_from_bom", {
    steps: () => [
        {
            trigger: '[name="product_tmpl_id"]',
            run: "click",
        },
        {
            trigger: '.o_stat_text:contains("BoM Overview")',
            run: "click",
        },
        {
            trigger: '[data-icon="toggle_off"]',
            run: "click",
        },
        {
            trigger: 'button.btn-primary:contains("Manufacture")',
            run: "click",
        },
        {
            trigger: '.o_mrp_production_state[name="state"]:contains("Draft")',
        },
    ],
});
