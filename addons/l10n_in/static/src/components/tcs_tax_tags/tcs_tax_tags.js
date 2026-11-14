import {
    Many2ManyTaxTagsField,
    many2ManyTaxTagsField,
} from "@account/components/many2x_tax_tags/many2x_tax_tags";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { x2ManyCommands } from "@web/core/orm_plugin";
import { registry } from "@web/core/registry";

export class L10nInTcsTaxTagsField extends Many2ManyTaxTagsField {
    setup() {
        super.setup();
        const update = this.update;
        this.update = (records) => this.updateTcsTaxes(() => update(records));
    }

    async deleteTag(id) {
        return this.updateTcsTaxes(() => super.deleteTag(id));
    }

    async updateTcsTaxes(update) {
        const record = this.props.record;
        const move = record.model.root;
        const getTcsIds = () =>
            record.data[this.props.name].records
                .filter((tax) => tax.data.l10n_in_tax_type === "tcs")
                .map((tax) => tax.resId);
        const previousIds = getTcsIds();
        await update();
        if (
            move.resModel !== "account.move" ||
            move.data.country_code !== "IN" ||
            move.data.state !== "draft" ||
            move.data.move_type === "entry" ||
            record.data.display_type !== "product" ||
            move.data.invoice_line_ids.count < 2
        ) {
            return;
        }
        const currentIds = getTcsIds();
        const added = currentIds.filter((id) => !previousIds.includes(id));
        const removed = previousIds.filter((id) => !currentIds.includes(id));
        if (!added.length && !removed.length) {
            return;
        }
        this.dialog.add(ConfirmationDialog, {
            title: _t("Update TCS Taxes"),
            body: _t(
                "Apply the same TCS tax additions and removals to all other invoice lines? Other taxes will remain unchanged."
            ),
            confirmLabel: _t("Update All Lines"),
            cancelLabel: _t("Keep This Line Only"),
            confirm: async () => {
                const lines = move.data.invoice_line_ids;
                if (lines.editedRecord && !(await lines.editedRecord.checkValidity())) {
                    return false;
                }
                const { limit, offset } = lines;
                const paginated = lines.records.length < lines.count;
                try {
                    if (paginated) {
                        await lines.load({ limit: lines.count, offset: 0 });
                    }
                    const commands = lines.records
                        .filter(
                            (line) => line.id !== record.id && line.data.display_type === "product"
                        )
                        .map((line) =>
                            x2ManyCommands.update(line.resId || line._virtualId, {
                                tax_ids: [
                                    ...removed.map((id) => x2ManyCommands.unlink(id)),
                                    ...added.map((id) => x2ManyCommands.link(id)),
                                ],
                            })
                        );
                    await move.update({ invoice_line_ids: commands });
                } finally {
                    if (paginated) {
                        await lines.load({ limit, offset });
                    }
                }
            },
        });
    }
}

registry.category("fields").add("l10n_in_tcs_tax_tags", {
    ...many2ManyTaxTagsField,
    component: L10nInTcsTaxTagsField,
    relatedFields: (params) => [
        ...many2ManyTaxTagsField.relatedFields(params),
        { name: "l10n_in_tax_type", type: "selection" },
    ],
});
