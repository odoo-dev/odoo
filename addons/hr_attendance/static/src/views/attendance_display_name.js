/**
 * The attendance display name starts with the employee name, unless the
 * employee is obvious from the view: this key in the context hides it.
 */
export const HIDE_EMPLOYEE_CONTEXT_KEY = "attendance_hide_employee";

/**
 * @param {Array} domain search domain (list form)
 * @returns {boolean} whether the domain filters on the employee
 */
export function filtersOnEmployee(domain) {
    return (domain || []).some(
        (leaf) =>
            Array.isArray(leaf) &&
            typeof leaf[0] === "string" &&
            (leaf[0] === "employee_id" || leaf[0].startsWith("employee_id.")) &&
            leaf[0] !== "employee_id.active"
    );
}
