import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("test_change_password_tour", {
    url: "/odoo",
    steps: () => [
        {
            content: "Go to settings.",
            trigger: ".o_app[data-menu-xmlid='base.menu_administration']",
            run: "click",
        },
        {
            content: "Open 'Users & companies' menu.",
            trigger: "button[data-menu-xmlid='base.menu_users']",
            run: "click",
        },
        {
            content: "Go to users.",
            trigger: "a[data-menu-xmlid='base.menu_action_res_users']",
            run: "click",
        },
        {
            content: "Select user.",
            trigger: 'tr:contains("user_internal") input[type="checkbox"]',
            run: "check",
        },
        {
            content: "Open 'Actions' menu.",
            trigger: 'span:contains("Actions")',
            run: "click",
        },
        {
            content: "Open 'Change password' modal.",
            trigger: '.o-dropdown-item:contains("Change Password")',
            run: "click",
        },
        {
            content: "Select input.",
            trigger: '.modal tr:contains("user_internal") td[name="new_passwd"]',
            run: "click",
        },
        {
            content: "Enter new password.",
            trigger: '.modal tr:contains("user_internal") input[type="password"]',
            run: "edit newpassword",
        },
        {
            content: "Submit new password.",
            trigger: 'button[name="change_password_button"]',
            run: "click",
        },
        {
            content: "Enter current password in the check identity modal.",
            trigger: 'input[placeholder="Enter your password"]',
            run: "edit admin",
        },
        {
            content: "Submit the check identity modal.",
            trigger: "#password_confirm",
            run: "click",
        },
        {
            content: "Wait until the modal is closed",
            trigger: "body:not(.modal-open)",
        },
        {
            content: "Open user menu.",
            trigger: ".o_user_menu .o-dropdown",
            run: "click",
        },
        {
            content: "Log out.",
            trigger: 'a[data-menu="logout"]',
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Enter user login.",
            trigger: 'input[name="login"]',
            run: "edit user_internal",
        },
        {
            content: "Enter user new password.",
            trigger: 'input[name="password"]',
            run: "edit newpassword",
        },
        {
            content: "Log in.",
            trigger: '.oe_login_form button[type="submit"]',
            run: "click",
            expectUnloadPage: true,
        },
        {
            content: "Log in.",
            trigger: '.oe_topbar_name:contains("Internal"):not(:visible)',
        }
    ],
});
