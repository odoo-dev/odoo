import {
    changeOption,
    clickOnSave,
    clickOnSnippet,
    insertSnippet,
    registerWebsitePreviewTour,
    selectElementInWeSelectWidget
} from "@website/js/tours/tour_utils";

const optionBlock = "EmployeeDetails";
const employeeDetailsSnippet = {
    id: "s_employee_details",
    name: "Employee details",
    groupName: "Employees"
};

function checkEmployeeDetails(emp_name, emp_dept) {
    return [
        {
            content: "Checking employee name",
            trigger: `:iframe .employee-name:contains('${emp_name}')`,
        },
        {
            content: "Checking employee department",
            trigger: `:iframe .employee-department:contains('${emp_dept}')`,
        },
    ]
}

function checkTemplate(template) {
    return {
        content: "Checking layout template",
        trigger: `:iframe .s_employee_details_dynamic_${template}`,
    }
}

registerWebsitePreviewTour("website_hr_employee.snippet_employee_details", {
    url: "/",
    edition: true,
},  () => [
        ...insertSnippet(employeeDetailsSnippet),
        ...clickOnSnippet(employeeDetailsSnippet),
        ...selectElementInWeSelectWidget("department_opt", "management", true),
        checkTemplate("card"),
        changeOption(optionBlock, 'we-select[data-attribute-name="layout"] we-toggler', "layout option"),
        changeOption(optionBlock, 'we-button[data-select-data-attribute="list"]'),
        checkTemplate("list"),
        ...checkEmployeeDetails("Employee Manager", "management"),
        ...selectElementInWeSelectWidget("department_opt", "hr", true),
        ...checkEmployeeDetails("Employee HR", "hr"),
        ...clickOnSave(),
    ]
);
