import {
    changeOption,
    clickOnEditAndWaitEditMode,
    clickOnSave,
    clickOnSnippet,
    insertSnippet,
    registerWebsitePreviewTour,
} from "@website/js/tours/tour_utils";

registerWebsitePreviewTour(
    "dynamic_employee_card",
    {
        url: "/",
    },
    () => [
        // check if the snippet is working
        ...clickOnEditAndWaitEditMode(),
        ...insertSnippet({
            id: "dynamic_employee_card",
            name: "Employee Card",
            groupName: "Employee Card",
        }),
        ...clickOnSnippet({
            id: "s_website_dynamic_employee_card",
        }),
        {
            trigger: ":iframe .s_website_dynamic_employee_card_load_more_btn",
            content: "Click to load more employees",
            run: "click",
        },
        changeOption(
            "websiteDynamicEmployeeCard",
            'we-select[data-name="department_id"] we-toggler',
            "department selector"
        ),
        changeOption(
            "websiteDynamicEmployeeCard",
            'we-button[data-set-department="1"]',
            "department 1"
        ),
        {
            trigger: ':iframe section[data-department="1"]',
            content: "Checks if filter is applied or not",
        },
        {
            trigger:
                "body:not(:has(.s_website_dynamic_employee_card_load_more_btn))",
            content: "Check that load more button should not be present",
        },
        changeOption(
            "websiteDynamicEmployeeCard",
            'we-select[data-name="view_type"] we-toggler',
            "view type selector"
        ),
        changeOption(
            "websiteDynamicEmployeeCard",
            'we-button[data-select-data-attribute="list"]',
            "view type list"
        ),
        {
            trigger: ':iframe section[data-view_type="list"]',
            content: "Check if list view is applied or not",
        },
        ...clickOnSave(),
    ]
);
