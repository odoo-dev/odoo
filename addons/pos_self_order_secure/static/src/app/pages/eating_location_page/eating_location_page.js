import { EatingLocationPage } from "@pos_self_order/app/pages/eating_location_page/eating_location_page";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(EatingLocationPage.prototype, {
    selectPreset(preset) {
        if (
            this.selfOrder._isSessionTimeoutEnabled() &&
            preset.service_at === "table" &&
            this.selfOrder._isSessionExpired
        ) {
            if (this.selfOrder.notification) {
                this.selfOrder.notification.add(
                    _t("Your session has expired. Please scan the QR code again to order dine-in."),
                    { type: "danger" }
                );
            }
            return;
        }
        return super.selectPreset(preset);
    },
});
