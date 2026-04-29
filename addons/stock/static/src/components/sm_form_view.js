import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FormController } from "@web/views/form/form_controller";
import { formView } from "@web/views/form/form_view";

export class StockMoveFormController extends FormController {
    setup() {
        super.setup();
        this.dialog = useService("dialog");
    }

    async save(params) {
        await this.model._askChanges();
        const ml_ids = this.model.root.data.move_line_ids.records.filter((ml) => {
            const changes = ml._changes || {};
            const finalPackage =
                "result_package_id" in changes
                    ? changes.result_package_id
                    : ml.data.result_package_id;
            return (
                (ml.dirty && "result_package_id" in changes) ||
                (finalPackage && ("quantity" in changes || "uom_id" in changes))
            );
        });
        const action = await this.orm.call(
            "stock.move.line",
            "action_put_in_pack_weight_warning_wizard",
            [
                ml_ids.map((ml) => ml.evalContext.id),
                false,
                ml_ids.flatMap((ml) =>
                    ml._changes.result_package_id
                        ? ml._changes.result_package_id.id
                        : ml.data.result_package_id.id
                ),
            ],
            {
                context: {
                    ml_changes: ml_ids.map((ml) => ({
                        id: ml.evalContext.id,
                        changes: ml._changes,
                    })),
                },
            }
        );

        if (action) {
            return this.dialog.add(ConfirmationDialog, {
                body: "The total weight of the packages exceeds the maximum weight allowed for the selected package type. Do you want to proceed anyway?",
                confirmLabel: _t("Confirm"),
                confirm: () => super.save(params),
                cancel: () => {},
            });
        }
        return super.save(params);
    }
}

export const StockMoveFormView = {
    ...formView,
    Controller: StockMoveFormController,
};

registry.category("views").add("sm_form", StockMoveFormView);
