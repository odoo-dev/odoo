odoo.define('payment_test.payment_form', require => {
    'use strict';

    const checkoutForm = require('payment.checkout_form');
    const manageForm = require('payment.manage_form');

    const paymentTestMixin = {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Execute the acquirer-specific implementation of the direct payment flow.
         *
         * For an acquirer to redefine the processing of the direct payment flow, it must override
         * this method.
         *
         * @override method from payment.payment_form_mixin
         * @private
         * @param {string} provider - The provider of the acquirer
         * @param {number} acquirerId - The id of the acquirer handling the transaction
         * @param {object} processingValues - The processing values of the transaction
         * @return {undefined}
         */
        _processDirectPayment: function (provider, acquirerId, processingValues) {
            if (provider !== 'test') {
                return this._super(...arguments);
            }

            const customerInput = document.getElementById('customer_input').value;
            // Simulate a feedback from our imaginary payment provider
            return this._rpc({
                route: '/payment/test/simulate_payment',
                params: {
                    'reference': processingValues.reference,
                    'customer_input': customerInput,
                },
            }).then(() => {
                window.location = '/payment/status';
            });
        },

        /**
         * Prepare the inline form of Test for direct payment.
         *
         * @override method from payment.payment_form_mixin
         * @private
         * @param {string} provider - The provider of the selected payment option's acquirer
         * @param {integer} paymentOptionId - The id of the selected payment option
         * @param {string} flow - The online payment flow of the selected payment option
         * @return {undefined}
         */
        _prepareInlineForm: function (provider, paymentOptionId, flow) {
            if (provider !== 'test' || flow === 'token') {
                return this._super(...arguments);
            }
            this._setPaymentFlow('direct');
        },
    };
    checkoutForm.include(paymentTestMixin);
    manageForm.include(paymentTestMixin);
});
