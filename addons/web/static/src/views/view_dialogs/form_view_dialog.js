/** @odoo-module **/

import { Dialog } from "@web/core/dialog/dialog";
import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { FormRenderer } from "@web/views/form/form_renderer";
import { FormArchParser } from "@web/views/form/form_view";

export class FormViewDialog extends Dialog {
    setup() {
        super.setup();
        this.viewService = useService("view");
        this.archInfo = this.props.archInfo;
        this.title = sprintf(this.env._t("Open: %s"), this.props.title);
    }

    async willStart() {
        if (!this.archInfo) {
            const { form } = await this.viewService.loadViews({
                resModel: this.props.record.resModel,
                context: this.props.record.context,
                views: [[false, "form"]], // FIXME: get view_id somewhere?
            });
            const archInfo = new FormArchParser().parse(form.arch, form.fields);
            this.archInfo = {
                ...archInfo,
                activeFields: archInfo.fields,
                fields: form.fields,
            };
        }
        // FIXME: here we override the fields of the list/kanban view
        Object.assign(this.props.record.activeFields, this.archInfo.fields);
        Object.assign(this.props.record.fields, this.archInfo.fields);
        this.props.record.fieldNames = Object.keys(this.props.record.activeFields);
        await this.props.record.load();
    }

    save() {
        console.log("TODO: savepoint");
        this.close();
    }

    cancel() {
        console.log("TODO: go back to savepoint");
        this.close();
    }
}
FormViewDialog.bodyTemplate = "web.FormViewDialogBody";
FormViewDialog.footerTemplate = "web.FormViewDialogFooter";
FormViewDialog.components = { FormRenderer };
FormViewDialog.contentClass = "o_form_view_dialog";
