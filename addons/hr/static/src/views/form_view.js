import { registry } from "@web/core/registry";

import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";

import { useArchiveEmployee } from "@hr/views/archive_employee_hook";
import { FormRenderer } from "@web/views/form/form_renderer";
import { HrField } from "../components/hr_field/hr_field";
import { onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class EmployeeFormController extends FormController {
    setup() {
        super.setup();
        this.archiveEmployee = useArchiveEmployee();
        this.fieldDifferencesService = useService("fieldDifferenceBetweenVersions");
        onWillUpdateProps(() => {
            this.fieldDifferencesService.clearCache(this.model.root.resId);
        });
        this.props.onSave = async () => {
            this.fieldDifferencesService.clearCache(this.model.root.resId);
        };
    }

    getStaticActionMenuItems() {
        const menuItems = super.getStaticActionMenuItems();
        menuItems.archive.callback = this.archiveEmployee.bind(this, [this.model.root.resId]);
        return menuItems;
    }
}

export class EmployeeFormRenderer extends FormRenderer {
    static components = {
        ...FormRenderer.components,
        Field: HrField,
    };
}

registry.category("views").add("hr_employee_form", {
    ...formView,
    Controller: EmployeeFormController,
    Renderer: EmployeeFormRenderer,
});
