/** @odoo-module **/

import { _t } from '@web/core/l10n/translation';
import { patch } from '@web/core/utils/patch';
import { PaymentForm } from '@payment/interactions/payment_form';


patch(PaymentForm.prototype, {
    /**
     * Intercept the standard redirect flow to preserve the QFPay URL hash (#/?).
     * @override
     */
    async _processRedirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'qfpay') {
            return super._processRedirectFlow(...arguments);
        }

        const apiUrl = processingValues.api_url;

        if (apiUrl) {
            try {
                const parsedUrl = new URL(apiUrl);

                if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
                    throw new Error("Invalid URL scheme detected.");
                }
                const safeUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
                window.top.location.assign(safeUrl);
            } catch {
                this._displayErrorDialog(_t("Payment Error"), _t("Unsafe or invalid QFPay redirect URL."));
                this._enableButton();
            }
        } else {
            this._displayErrorDialog(_t("Payment Error"), _t("Could not initiate QFPay redirect."));
            this._enableButton();
        }
    },
});
