/** @odoo-module */

import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

registry.category("web_tour.tours").add("test_base_automation", {
    test: true,
    url: "/web?debug=tests",
    steps: [
        stepUtils.showAppsMenuItem(),
        {
            id: "settings_menu_click",
            content: "Go to Settings",
            trigger: '.o_app[data-menu-xmlid="base.menu_administration"]',
        },
        {
            content: "Go to Technical",
            trigger: ".o_menu_sections .o-dropdown:last-child button",
        },
        {
            content: "Go to Automation Rules",
            trigger:
                '.o_menu_sections .o-dropdown:last-child .dropdown-menu a[data-menu-xmlid="base_automation.menu_base_automation_form"]',
        },
        {
            content: "Create new rule",
            trigger: ".o_control_panel .o_control_panel_collapsed_create .o-kanban-button-new",
        },
        {
            content: "Enter rule name",
            trigger: ".o_form_renderer .oe_title .o_input",
            run: "text Test rule",
        },
        {
            content: "Select model",
            trigger: '.o_form_renderer .o_group div[name="model_id"] input',
            run: "text Contact",
        },
        {
            content: "Select model contact",
            trigger:
                '.o_form_renderer .o_group div[name="model_id"] .dropdown-menu li:first-child a',
        },
        {
            content: "Open select",
            trigger: ".o_form_renderer #trigger_0",
        },
        {
            content: "Select On save",
            trigger: ".o_form_renderer #trigger_0",
            run: `text "on_create_or_write"`,
        },
        {
            content: "Add new action",
            trigger: '.o_form_renderer div[name="action_server_ids"] button',
        },
        {
            content: "Open update select",
            trigger: '.o_form_renderer .o_field_widget[name="update_field_id"] input',
            run: "text A",
        },
        {
            content: "Open update select",
            trigger: '.o_form_renderer div[name="update_field_id"] .dropdown-menu li:first-child a',
        },
        {
            content: "Open update select",
            trigger: '.o_form_renderer div[name="value"] textarea',
            run: "text Test",
        },
        {
            content: "Open update select",
            trigger: ".o_form_button_save",
        },
        ...stepUtils.saveForm(),
    ],
});
