import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";

export class AllocationFormViewDialog extends FormViewDialog {
    setup() {
        super.setup();
        Object.assign(this.viewProps, {
            staticControlPanelButtons: {
                ...this.staticControlPanelButtons,
                save: {
                    template: "hr_holidays.AllocationFormViewDialog.Buttons.Save",
                    sequence: 10,
                },
            },
        });
    }
};
