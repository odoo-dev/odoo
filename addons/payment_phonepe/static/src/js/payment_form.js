/** @odoo-module **/
/* global Phonepe */

import { loadJS } from '@web/core/assets';
import { PaymentForm } from '@payment/interactions/payment_form';
import { patch } from '@web/core/utils/patch';

patch(PaymentForm.prototype, {

    // #=== DOM MANIPULATION ===#

    /**
     * Update the payment context to set the flow to 'direct'.
     *
     * @override method from @payment/js/payment_form
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'phonepe') {
            await super._prepareInlineForm(...arguments);
            return;
        }

        // Overwrite the flow of the select payment method.
        this._setPaymentFlow('direct');
    },

    // #=== PAYMENT FLOW ===#

    async _processDirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'phonepe') {
            await super._processDirectFlow(...arguments);
            return;
        }
        const phonepeOptions = this._preparePhonepeOptions(processingValues);
        await loadJS('https://mercury.phonepe.com/web/bundle/checkout.js');
        window.PhonePeCheckout.transact(phonepeOptions);
    },

    /**
     * Prepare the options to init the Phonepe SDK Object.
     *
     * @param {object} processingValues - The processing values.
     * @return {object}
     */
    _preparePhonepeOptions(processingValues) {
        const { token_url, type } = processingValues;
        return {
            tokenUrl: token_url,
            type,
            callback: (response) => {
                if (response === "USER_CANCEL") {
                    window.location.reload();
                }
                if (response === "CONCLUDED") {
                    window.location = '/payment/status';
                }
            }
        }
    },

});
