
import { registry } from "@web/core/registry";

const SLEEP_TIME = 0; // Test will pass with values > ~200

function sleep(ms = SLEEP_TIME) {
    return [
        {
            content: `wait ${ms}ms for pending order line updates to settle`,
            trigger: "div[name='order_line']",
            run: async () => {
                await new Promise((resolve) => setTimeout(resolve, ms));
            },
        },
    ];
}

registry.category("web_tour.tours").add('test_sale_lse_tour', {
    steps: () => [
        {
            trigger: ".o_field_x2many_list_row_add > button",
            run: "click",
        },
        ...sleep(),
        {
            trigger: ".o_selected_row .o_field_widget[name='name'] textarea.o_input",
            run: "edit Chair floor protection",
        },
        {
            trigger: ".o-autocomplete a:contains('Chair floor protection')",
            run: "click",
        },


        {
            trigger: ".o_field_x2many_list_row_add > button",
            run: "click",
        },
        ...sleep(),
        {
            trigger: ".o_selected_row .o_field_widget[name='name'] textarea.o_input",
            run: "edit Desk Pad",
        },
        {
            trigger: ".o-autocomplete a:contains('Desk Pad')",
            run: "click",
        },
    ]
});
