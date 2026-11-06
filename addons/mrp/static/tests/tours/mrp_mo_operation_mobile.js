import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";

registry.category("web_tour.tours").add("test_basic_mo_process_on_mobile", {
    steps: () => [
        {
            trigger: ".o_field_widget[name=product_id] input",
            run: "click",
        },
        {
            trigger: ".modal .o_kanban_record:contains('final product')",
            run: "click",
        },
        ...stepUtils.saveForm(),
        {
            trigger: "button[name=action_confirm]",
            run: "click",
        },
        {
            trigger: "button[name=button_mark_done]",
            run: "click",
        },
        {
            content: "Wait for the MO be done",
            trigger: ".oe_title .o_field_badge[name=state]:contains('Done')",
        },
    ],
});
