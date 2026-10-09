import { PaymentScreenPaymentLines } from "@point_of_sale/app/screens/payment_screen/payment_lines/payment_lines";
import { patch } from "@web/core/utils/patch";
import { useVivaApp } from "../../../hooks/use_viva_app";
import { _t } from "@web/core/l10n/translation";

patch(PaymentScreenPaymentLines.prototype, {
    setup() {
        super.setup();
        this.vivaApp = useVivaApp();
    },

    getPaymentActionState(line) {
        if (this.vivaApp.isIntegrated(line) && line.getPaymentStatus() === "waiting") {
            return {
                id: "viva_confirming",
                title: _t("Confirming the payment"),
                icon: "autorenew",
                iconClass: "oi-spin",
                actions: [],
            };
        }
        if (this.vivaApp.isIntegrated(line) && line.getPaymentStatus() !== "force_done") {
            const retry = line.getPaymentStatus() === "retry";
            return {
                id: retry ? "viva_retry_app" : "viva_continue_app",
                title: retry ? _t("Payment not completed") : _t("Continue on Viva app"),
                icon: retry ? "smartphone" : "autorenew",
                iconClass: retry ? "" : "oi-spin",
                actions: [
                    ...(retry
                        ? [
                              {
                                  id: "viva_retry",
                                  label: _t("Retry"),
                                  title: _t("Retry on the Viva app"),
                                  action: () => this.vivaApp.retry(line),
                              },
                              {
                                  id: "viva_cancel",
                                  label: _t("Cancel"),
                                  title: _t("Remove this payment"),
                                  action: () => this.props.deleteLine(line.uuid),
                              },
                          ]
                        : []),
                    {
                        id: "viva_reset_integration",
                        label: _t("Reset Integration"),
                        title: _t("Reset Viva Integration"),
                        action: () => this.vivaApp.resetIntegration(line),
                        severity: "danger",
                    },
                ],
            };
        }

        const state = super.getPaymentActionState(...arguments);
        if (
            this.vivaApp.use(line.payment_method_id) &&
            this.vivaApp.hasRefused() &&
            !line.isDone()
        ) {
            state.actions = [
                ...state.actions,
                {
                    id: "viva_use_app",
                    label: _t("Use Viva app"),
                    title: _t("Pay with the Viva Wallet application"),
                    action: () => {
                        this.vivaApp.forgetIntegration();
                        this.props.deleteLine(line.uuid);
                    },
                    severity: "warning",
                },
            ];
        }
        return state;
    },
});
