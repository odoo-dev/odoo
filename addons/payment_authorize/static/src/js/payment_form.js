/** @odoo-module **/
/* global Accept */

import { _t } from '@web/core/l10n/translation';
import { loadJS } from '@web/core/assets';

import paymentForm from '@payment/js/payment_form';

paymentForm.include({

    /**
     * Prepare the inline form of Authorize.net for direct payment.
     *
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'authorize') {
            this._super(...arguments);
            return;
        }

        if (flow === 'token') {
            return; // Don't show the form for tokens.
        }

        this._setPaymentFlow('direct');

        if (!this.authorizeInfo){
            let acceptJSUrl = 'https://js.authorize.net/v1/Accept.js';
            const radio = document.querySelector('input[name="o_payment_radio"]:checked');
            const inlineForm = this._getInlineForm(radio);
            this.authorizeForm = inlineForm.querySelector('[name="o_authorize_form"]');
            this.authorizeInfo = JSON.parse(this.authorizeForm.dataset['inlineFormValues']);
            if (this.authorizeInfo.state !== 'enabled') {
                acceptJSUrl = 'https://jstest.authorize.net/v1/Accept.js';
            }
            loadJS(acceptJSUrl).guardedCatch((error) => {
                error.event.preventDefault();
                this._displayErrorDialog(
                    _t("Cannot display the payment form"), error.message.data.message
                );
                this._enableButton();
            });
        }

    },

    /**
     * Trigger the payment processing by submitting the data.
     *
     * @override method from payment.payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The payment flow of the selected payment option.
     * @return {void}
     */
    async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'authorize' || flow === 'token') {
            this._super(...arguments); // Tokens are handled by the generic flow
            return;
        }

        if (!this._validateFormInputs(paymentMethodCode)) {
            this._enableButton(); // The submit button is disabled at this point, enable it
            return;
        }
        else{
            return await this._super(...arguments);
        }
    },

    /**
     * Process the direct payment flow.
     *
     * @override method from payment.payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {object} processingValues - The processing values of the transaction.
     * @return {void}
     */
    async _processDirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'authorize') {
            this._super(...arguments);
            return;
        }

        // Build the authentication and card data objects to be dispatched to Authorized.Net
        const secureData = {
            authData: {
                apiLoginID: this.authorizeInfo.login_id,
                clientKey: this.authorizeInfo.client_key,
            },
            ...this._getPaymentDetails(paymentMethodCode),
        };

        // Dispatch secure data to Authorize.Net to get a payment nonce in return
        Accept.dispatchData(
            secureData, response => this._responseHandler(response, processingValues)
        );
    },

    /**
     * Checks that all payment inputs adhere to the DOM validation constraints.
     *
     * @private
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {boolean} - Whether all elements pass the validation constraints
     */
    _validateFormInputs(paymentMethodCode) {
        const inputs = Object.values(this._getInlineFormInputs(paymentMethodCode));
        return inputs.every(element => element.reportValidity());
    },

    /**
     * Return all relevant inline form inputs based on the payment method type of the provider.
     *
     * @private
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {Object} - An object mapping the name of inline form inputs to their DOM element
     */
    _getInlineFormInputs(paymentMethodCode) {
        if (paymentMethodCode === 'card') {
            return {
                card: this.authorizeForm.querySelector(`#o_authorize_card`),
                month: this.authorizeForm.querySelector(`#o_authorize_month`),
                year: this.authorizeForm.querySelector(`#o_authorize_year`),
                code: this.authorizeForm.querySelector(`#o_authorize_code`),
            };
        } else {
            return {
                accountName: this.authorizeForm.querySelector(`#o_authorize_account_name`),
                accountNumber: this.authorizeForm.querySelector(`#o_authorize_account_number`),
                abaNumber: this.authorizeForm.querySelector(`#o_authorize_aba_number`),
                accountType: this.authorizeForm.querySelector(`#o_authorize_account_type`),
            };
        }
    },

    /**
     * Return the credit card or bank data to pass to the Accept.dispatch request.
     *
     * @private
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {Object} - Data to pass to the Accept.dispatch request
     */
    _getPaymentDetails(paymentMethodCode) {
        const inputs = this._getInlineFormInputs(paymentMethodCode);
        if (paymentMethodCode === 'card') {
            return {
                cardData: {
                    cardNumber: inputs.card.value.replace(/ /g, ''), // Remove all spaces
                    month: inputs.month.value,
                    year: inputs.year.value,
                    cardCode: inputs.code.value,
                },
            };
        } else {
            return {
                bankData: {
                    nameOnAccount: inputs.accountName.value.substring(0, 22), // Max allowed by acceptjs
                    accountNumber: inputs.accountNumber.value,
                    routingNumber: inputs.abaNumber.value,
                    accountType: inputs.accountType.value,
                },
            };
        }
    },

    /**
     * Handle the response from Authorize.Net and initiate the payment.
     *
     * @private
     * @param {object} response - The payment nonce returned by Authorized.Net
     * @param {object} processingValues - The processing values of the transaction.
     * @return {void}
     */
    _responseHandler(response, processingValues) {
        if (response.messages.resultCode === 'Error') {
            let error = '';
            response.messages.message.forEach(msg => error += `${msg.code}: ${msg.text}\n`);
            this._displayErrorDialog(
                _t("We are not able to process your payment."),
                error
            );
            this._enableButton();
            return;
        }

        // Initiate the payment
        this._rpc({
            route: '/payment/authorize/payment',
            params: {
                'reference': processingValues.reference,
                'partner_id': processingValues.partner_id,
                'opaque_data': response.opaqueData,
                'access_token': processingValues.access_token,
            }
        }).then(() => {
            window.location = '/payment/status';
        }).guardedCatch((error) => {
            error.event.preventDefault();
            this._displayErrorDialog(
                _t("We are not able to process your payment."),
                error.message.data.message,
            );
            this._enableButton();
        });
    },

});
