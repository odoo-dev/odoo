import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePopover } from "@web/core/popover/popover_hook";
import { registry } from "@web/core/registry";
import { SelectionField, selectionField } from "@web/views/fields/selection/selection_field";

export class EtaSubmissionStatusPopover extends Component {
    static template = "l10n_eg_edi_eta.EtaSubmissionStatusPopover";
    static props = {
        message: { type: String },
        close: { type: Function, optional: true },
    };
}


export class EtasubmissionStatus extends SelectionField {
    static template = "l10n_eg_edi_eta.EtasubmissionStatus";

    setup() {
        super.setup();
        this.popover = usePopover(EtaSubmissionStatusPopover, {
            animation: false,
        });
    }

    onClickInfo(ev) {
        const data = this.props.record.data;
        const message = ['sent', 'test'].includes(data.l10n_eg_eta_submission_state) ? _t("Invoice accepted by ETA") : data.l10n_eg_eta_error_message ?? _t("No info provided.");
        this.popover.open(ev.target, {
            message: message,
            close: () => this.popover.close(),
        });
    }
}

export const etaSubmissionStatus = {
    ...selectionField,
    component: EtasubmissionStatus,
}

registry.category("fields").add("eta_submission_status", etaSubmissionStatus);
