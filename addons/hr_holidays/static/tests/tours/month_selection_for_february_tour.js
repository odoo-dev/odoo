import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";

registry.category("web_tour.tours").add("month_selection_for_february_tour", {
    steps: () => [
        stepUtils.showAppsMenuItem(),
        {
            content: "Open Time Off App",
            trigger: ".o_app[data-menu-xmlid='hr_holidays.menu_hr_holidays_root']",
            run: "click",
        },
        {
            content: "Open Configuration menu",
            trigger: ".o-dropdown[data-menu-xmlid='hr_holidays.menu_hr_holidays_configuration']",
            run: "click",
        },
        {
            content: "Go to Accurals",
            trigger: ".o-dropdown-item[data-menu-xmlid='hr_holidays.hr_holidays_accrual_menu_configuration']",
            run: "click",
        },
        {
            content: "Click 'New' Button",
            trigger: ".o_list_button_add:contains('New')",
            run: "click",
        },
        {
            content: "Click select a carryover month",
            trigger: ".o_input[id='carryover_month_0']",
            run: "click",
        },
        {
            content: "Click February",
            trigger: ".o-dropdown-item[role='menuitem']:contains('February')",
            run: "click",
        },
        {
            content: "Click select a carryover day",
            trigger: ".o_input[id='carryover_day_0']",
            run: "click",
        },
        {
            content: "Check if 29 is available",
            trigger: ".o_select_menu_menu:has(.o_select_menu_item:contains(29))",
        },
        {
            content: "Check if 30 is not available",
            trigger: ".o_select_menu_menu:not(:has(.o_select_menu_item:contains(30)))",
        },
        {
            content: "Select 29",
            trigger: ".o_select_menu_menu:has(.o_select_menu_item:contains(29))",
            run: "click",
        },
        {
            content: "Discard the form",
            trigger: ".o_form_button_cancel",
            run: "click",
        },
    ]
});