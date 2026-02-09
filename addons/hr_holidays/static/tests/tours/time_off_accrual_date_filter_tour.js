import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_utils";

registry.category("web_tour.tours").add("time_off_accrual_date_filter_tour", {
    url: "/odoo",
    steps: () => [
        stepUtils.showAppsMenuItem(),
        // Open Time Off app and create new accrual plan
        {
            content: "Open Time Off app",
            trigger: '.o_app[data-menu-xmlid="hr_holidays.menu_hr_holidays_root"]',
            run: "click",
        },
        {
            content: "Open Configuration",
            trigger:
                '.o_menu_sections [data-menu-xmlid="hr_holidays.menu_hr_holidays_configuration"]',
            run: "click",
        },
        {
            content: "Open Accrual Plans",
            trigger:
                '.dropdown-item[data-menu-xmlid="hr_holidays.hr_holidays_accrual_menu_configuration"]',
            run: "click",
        },
        {
            content: "Click the New button to create a plan",
            trigger: ".o_list_button_add",
            run: "click",
        },
        {
            content: "Add a milestone",
            trigger: 'button[name="action_create_accrual_plan_level"]',
            run: "click",
        },
        {
            content: "Open the frequency dropdown menu",
            trigger: '.o_field_widget[name="frequency"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Wait for the menu to open",
            trigger: ".o_select_menu_menu",
        },
        {
            content: "Select the Yearly frequency type",
            trigger: '.o_select_menu_item[data-choice-index="6"]',
            run: "click",
        },
        // Check the number of days available for January (1-31)
        {
            content: "Open the month selection menu",
            trigger: '.o_field_widget[name="yearly_month"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Select January from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="0"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for dropdown to disappear",
            trigger: "body:not(:has(.o_select_menu_menu))",
        },
        {
            content: "Open the days menu",
            trigger: '.o_field_widget[name="yearly_day"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Verify January shows day 31",
            trigger: ".o_select_menu_menu:has(.o_select_menu_item:contains('31'))",
        },
        {
            content: "Verify January shows day 30",
            trigger: ".o_select_menu_menu:has(.o_select_menu_item:contains('30'))",
        },
        {
            content: "Select the last day from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="30"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for dropdown to disappear",
            trigger: "body:not(:has(.o_select_menu_menu))",
        },
        // Check the number of days available for February (1-29)
        {
            content: "Open the month selection menu",
            trigger: '.o_field_widget[name="yearly_month"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Select February from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="1"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for dropdown to disappear",
            trigger: "body:not(:has(.o_select_menu_menu))",
        },
        {
            content: "Open the days menu",
            trigger: '.o_field_widget[name="yearly_day"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Verify that 29 is the selected item in the open menu",
            trigger: '.o_select_menu_menu .o_select_menu_item.selected:contains("29")',
        },
        {
            content: "Check that 30 is missing",
            trigger: ".o_select_menu_menu:not(:has(.o_select_menu_item:contains('30')))",
        },
        {
            content: "Check that 31 is missing",
            trigger: ".o_select_menu_menu:not(:has(.o_select_menu_item:contains('31')))",
        },
        {
            content: "Select a day from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="28"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for dropdown to disappear",
            trigger: "body:not(:has(.o_select_menu_menu))",
        },
        // Check the number of days available for April (1-30)
        {
            content: "Open the month selection menu",
            trigger: '.o_field_widget[name="yearly_month"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Select April from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="3"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for dropdown to disappear",
            trigger: "body:not(:has(.o_select_menu_menu))",
        },
        {
            content: "Open the days menu",
            trigger: '.o_field_widget[name="yearly_day"] .o_select_menu_toggler',
            run: "click",
        },
        {
            content: "Check that 31 is missing",
            trigger: ".o_select_menu_menu:not(:has(.o_select_menu_item:contains('31')))",
        },
        {
            content: "Select a day from the list of months",
            trigger: '.o_select_menu_item[data-choice-index="28"]',
            run: function (actions) {
                actions.click();
            },
        },
        {
            content: "Wait for RPC and UI to settle",
            trigger: "body:not(.o_rpc_waiting)",
        },
        {
            trigger: 'button[special="save"]',
            content: "Save the Accrual Level Modal",
            run: "click",
        },
        {
            content: "Type the name of the accrual plan",
            trigger: '.o_field_char[name="name"] input',
            run: "fill Test Accrual plan",
        },
        {
            content: "Click the cloud save button",
            trigger: "button.o_form_button_save:has(i.fa-cloud-upload)",
            run: "click",
        },
    ],
});
