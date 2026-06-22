import { DocumentState } from "@account/components/document_state/document_state_field";
import { registry } from "@web/core/registry";
import { selectionField } from "@web/views/fields/selection/selection_field";

export class NilveraSendStatus extends DocumentState {
    get nilveraSendStatus() {
        return this.props.record.data.l10n_tr_nilvera_send_status;
    }

    get message() {
        if (this.nilveraSendStatus !== "error") {
            return "";
        }
        return this.props.record.data.l10n_tr_nilvera_error_message || "";
    }
}

registry.category("fields").add("l10n_tr_nilvera_send_status", {
    ...selectionField,
    component: NilveraSendStatus,
    fieldDependencies: [{ name: "l10n_tr_nilvera_error_message", type: "char" }],
});
