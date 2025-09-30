import { registry } from "@web/core/registry";

const fieldsChangedCachePerEmployee = {};

const fieldDifferenceBetweenVersions = {
    dependencies: ["orm"],
    start(env, { orm }) {
        async function getEmployeeFieldsChanged(employeeId) {
            if (!employeeId) {
                return;
            }
            if (employeeId in fieldsChangedCachePerEmployee) {
                return fieldsChangedCachePerEmployee[employeeId];
            }
            const promise = orm.call("hr.employee", "get_formatted_field_differences", [
                employeeId,
            ]);
            fieldsChangedCachePerEmployee[employeeId] = promise;
            promise
                .then((result) => {
                    fieldsChangedCachePerEmployee[employeeId] = result;
                })
                .catch(() => {
                    delete fieldsChangedCachePerEmployee[employeeId];
                });
            return promise;
        }
        async function getEmployeeFieldChanged(employeeId, fieldName) {
            const fieldsChanged = await getEmployeeFieldsChanged(employeeId);
            return fieldsChanged?.[fieldName];
        }
        function clearCache(employeeId) {
            if (!Object.keys(fieldsChangedCachePerEmployee).length) {
                return;
            }
            if (employeeId) {
                delete fieldsChangedCachePerEmployee[employeeId];
            } else {
                Object.keys(fieldsChangedCachePerEmployee).forEach(
                    (k) => delete fieldsChangedCachePerEmployee[k]
                );
            }
        }
        return { getEmployeeFieldChanged, clearCache };
    },
};

registry.category("services").add("fieldDifferenceBetweenVersions", fieldDifferenceBetweenVersions);
