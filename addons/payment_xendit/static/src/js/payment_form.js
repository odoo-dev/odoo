/** @odoo-module **/

import paymentForm from '@payment/js/payment_form';
import { RPCError } from '@web/core/network/rpc_service';


const xenditMixin = {

    _initiatePaymentFlow(provider, paymentOptionId, paymentMethodCode, flow) {
        if (provider !== 'xendit' || flow === 'token') {
            this._super(...arguments); // Tokens are handled by the generic flow
            return;
        }
        // The `onError` event handler is not used to validate inputs anymore since v5.0.0.
        this.rpc(
            this.paymentContext['transactionRoute'],
            this._prepareTransactionRouteParams(),
        ).then(processingValues => {
            return this.rpc(
                '/payment/xendit/payment_methods', {
                    "provider_id": processingValues.provider_id,
                    "reference": processingValues.reference,
                    "amount": processingValues.amount,
                    "currency_id": processingValues.currency_id,
                    "partner_id": processingValues.partner_id,
                    "payment_method_code": paymentMethodCode,
                    "payment_option_id": paymentOptionId,
                }
            )
        }).then(paymentResponse => {
            const $redirectForm = $('<form></form>').attr('id', 'o_payment_redirect_form')
            $redirectForm[0].setAttribute('target', '_top');
            $redirectForm[0].setAttribute('action', paymentResponse.url);
            $(document.getElementsByTagName('body')[0]).append($redirectForm);

            $redirectForm.submit()
        }).catch((error) =>{
            if (error instanceof RPCError) {
                this._displayErrorDialog("Payment processing failed", error.data.message);
                this._enableButton();
            } else {
                return Promise.reject(error);
            }
        })
    },
}

paymentForm.include(xenditMixin)
