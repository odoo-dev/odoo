import { _t } from "@web/core/l10n/translation";
import { ListController } from "@web/views/list/list_controller";

export class ArchiveDisabledListController extends ListController {
    setup() {
        super.setup();
        this.archiveEnabled = false;
    }

    get deleteConfirmationDialogProps() {
        return {
            title: _t("Delete Activities"),
            body: _t(
                "Are you sure you want to delete these activities? They will be gone forever!\nThink twice before you click that 'Delete' button!"
            ),
            confirmLabel: _t("Yes, delete"),
            cancelLabel: _t("No, go back"),
        };
    }
}
