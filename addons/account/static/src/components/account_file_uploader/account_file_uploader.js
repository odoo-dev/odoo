import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { DocumentFileUploader } from "../document_file_uploader/document_file_uploader";

export class AccountFileUploader extends DocumentFileUploader {
    setup() {
        super.setup()
        this.extraContext = this.getExtraContext();
    }

    getExtraContext() {
        const record_data = this.props.record ? this.props.record.data : false;
        return record_data ? {
            default_journal_id: record_data.id,
            default_move_type: (
                (record_data.type === 'sale' && 'out_invoice')
                || (record_data.type === 'purchase' && 'in_invoice')
                || 'entry'
            ),
        } : super.getExtraContext();

    }

    getResModel() {
        return "account.journal";
    }
}

//when file uploader is used on account.journal (with a record)
export const accountFileUploader = {
    component: AccountFileUploader,
    extractProps: ({ attrs }) => ({
        togglerTemplate: attrs.template || "account.JournalUploadLink",
        btnClass: attrs.btnClass || "",
        linkText: attrs.title || _t("Upload"),
    }),
    fieldDependencies: [
        { name: "id", type: "integer" },
        { name: "type", type: "selection" },
    ],
};

registry.category("view_widgets").add("account_file_uploader", accountFileUploader);
