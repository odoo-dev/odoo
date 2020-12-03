odoo.define('payment_ogone.payment_form', require => {
    'use strict';

    const core = require('web.core');
    const checkoutForm = require('payment.checkout_form');
    const manageForm = require('payment.manage_form');

    const _t = core._t;

    manageForm.include({
        init: function () {
            this._super.apply(this, arguments);
            this.isManageForm = true; // TODO ANV why ?
        }
    });

    const ogoneMixin = {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Prepare the inline form of Ogone for direct payment.
         *
         * @override method from payment.payment_form_mixin
         * @private
         * @param {string} provider - The provider of the selected payment option's acquirer
         * @param {integer} paymentOptionId - The id of the selected payment option
         * @param {string} flow - The online payment flow of the selected payment option
         * @return {undefined}
         */
        _prepareInlineForm: function (provider, paymentOptionId, flow) {
            const ogoneForm = document.getElementById(
                `o_payment_acquirer_inline_form_${paymentOptionId}`
            );
            if (provider !== 'ogone' || flow === 'token') {
                ogoneForm.style.display = 'none';
                return this._super(...arguments);
            }

            ogoneForm.style.display = 'revert'; // Display the form

            // Ogone payment is performed in the Iframe. The client decides if he wants to save his
            // payment data in the Ogone form. It also contains a "submit" button, so we also hide
            // the "Pay" button to avoid confusing the client.
            this._hideInputs();

            if (this.startedIframe) { // The iframe is already initialized, no need to restart it
                return this._super(...arguments);
            }

            this._setPaymentFlow('direct');

            // We need to setup the payment method to attach the iframe.
            const self = this;
            this._rpc({
                route: '/payment/ogone/payment_setup',
                params: {
                    'payment_option_id': paymentOptionId,
                    'reference_prefix': this.txContext.referencePrefix,
                    'amount': this.txContext.amount ? parseFloat(this.txContext.amount) : undefined,
                    'currency_id': this.txContext.currencyId
                        ? parseInt(this.txContext.currencyId)
                        : undefined,
                    'partner_id': parseInt(this.txContext.partnerId),
                    'order_id': this.txContext.orderId
                        ? parseInt(this.txContext.orderId)
                        : undefined,
                    'flow': flow,
                    'transaction_route': this.txContext.transactionRoute,
                    'validation_route': this.txContext.validationRoute,
                    'landing_route': this.txContext.landingRoute,
                    'access_token': this.txContext.accessToken,
                    'isValidation': this.isManageForm !== undefined ? this.isManageForm : false,
                    'acquirer_id': paymentOptionId,
                },
            }).then(paymentMethodsResult => {
                const iframe = document.getElementById('ogone_iframe_container_' + paymentMethodsResult['acquirer_id']);
                iframe.firstElementChild.src = paymentMethodsResult['ogone_iframe_url'];
                // arj todo uncomment me !!
                // self.startedIframe = true;
            }).guardedCatch((error) => {
                error.event.preventDefault();
                self._displayError(
                    _t("Server Error"),
                    _t("An error occurred when displayed this payment form."),
                    error.message.data.message
                );
            });
        },

    };
    checkoutForm.include(ogoneMixin);
    manageForm.include(ogoneMixin);
});
