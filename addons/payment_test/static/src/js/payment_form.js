odoo.define('payment_test.payment_form', require => {
    'use strict';

    const checkoutForm = require('payment.checkout_form');
    const manageForm = require('payment.manage_form');

    const paymentTestMixin = {

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Process the payment.
         *
         * @override method from payment.payment_form_mixin
         * @private
         * @param {string} provider - The provider of the payment option's acquirer
         * @param {number} paymentOptionId - The id of the payment option handling the transaction
         * @param {string} flow - The online payment flow of the transaction
         * @return {(object|undefined)} The transaction processing values if in direct payment flow
         */
        _processPayment: function (provider, paymentOptionId, flow) {
            // Let super create the transaction to work with the processing values
            return this._super(...arguments).then(result => {
                if (provider === 'test' && flow === 'direct') {
                    // Real acquirers don't have access to this information
                    const customerInput = document.getElementById('customer_input').value;
                    // Simulate a feedback from our imaginary payment provider
                    this._rpc({
                         route: '/payment/test/simulate_payment',
                         params: {
                             'reference': result.reference,
                             'customer_input': customerInput,
                         },
                    }).then(() => {
                        window.location = '/payment/status';
                    });
                }
                return result;
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
                this._super(...arguments);
            }
            this._setPaymentFlow('direct');
        },
    };
    checkoutForm.include(paymentTestMixin);
    manageForm.include(paymentTestMixin);
});
