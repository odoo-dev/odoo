/** @odoo-module */

import { FormViewDialog } from "@web/views/view_dialogs/form_view_dialog";

import { orm } from "@web/core/orm";
import { registry } from '@web/core/registry';

import { formView } from '@web/views/form/form_view';
import { FormController } from '@web/views/form/form_controller';

import { useLeaveCancelWizard } from '../hooks';

export class TimeOffDialogFormController extends FormController {
    static props = {
        ...FormController.props,
        onCancelLeave: Function,
        onRecordDeleted: Function,
        onLeaveCancelled: Function,
        onLeaveUpdated: Function,
    };

    setup() {
        super.setup();
        this.leaveCancelWizard = useLeaveCancelWizard();
    }

    get record() {
        return this.model.root;
    }

    async onClick(action) {
        const args = (action === 'action_approve') ? [this.record.resId, false] : [this.record.resId];
        await orm.call("hr.leave", action, args);
        this.props.onLeaveUpdated();
    }

    get canApprove() {
        return !this.model.root.isNew && (this.record.data.can_approve && ['confirm', 'refuse',].includes(this.record.data.state));
    }

    get canValidate() {
        return !this.model.root.isNew && (this.record.data.can_approve && this.record.data.state === 'validate1');
    }

    get canRefuse() {
        return !this.model.root.isNew && (this.record.data.can_approve && this.record.data.state && ['confirm', 'validate1', 'validate'].includes(this.record.data.state));
    }

    deleteRecord() {
        this.props.onRecordDeleted(this.record);
        this.props.onCancelLeave();
        if (this.record.data.can_cancel) {
            this.leaveCancelWizard(this.record.resId, () => {
                this.props.onLeaveCancelled();
            });
        }
    }

    get canDelete() {
        return !this.model.root.isNew && (this.record.data.can_cancel || this.record.data.state && !['validate', 'refuse', 'cancel'].includes(this.record.data.state));
    }
}

registry.category('views').add('timeoff_dialog_form', {
    ...formView,
    Controller: TimeOffDialogFormController,
});


export class TimeOffFormViewDialog extends FormViewDialog {
    static props = {
        ...TimeOffFormViewDialog.props,
        onRecordDeleted: Function,
        onLeaveCancelled: Function,
    };

    setup() {
        super.setup();

        this.viewProps = Object.assign(this.viewProps, {
            type: "timeoff_dialog_form",
            buttonTemplate: 'hr_holidays.FormViewDialog.buttons',
            onCancelLeave: () => {
                this.props.close();
            },
            onLeaveUpdated: () => {
                this.props.onRecordSaved();
                this.props.close();
            },
            onRecordDeleted: (record) => {
                this.props.onRecordDeleted(record)
            },
            onLeaveCancelled: this.props.onLeaveCancelled.bind(this),
        })
    }
}
