/** @odoo-module **/
/* global Accept */

import { _t } from '@web/core/l10n/translation';
import { loadJS } from '@web/core/assets';

import paymentForm from '@payment/js/payment_form';

paymentForm.include({

    /**
     * Prepare the Authorize.net inline form of the selected payment option.
     *
     * For a provider to manage an inline form, it must override this method and render the content
     * of the form.
     *
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The payment flow of the selected payment option.
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'authorize') {
            this._super(...arguments);
            return;
        }

        if (flow === 'token') {
            return; // Don't show the form for tokens
        }

        this._setPaymentFlow('direct');

        let acceptJSUrl = 'https://js.authorize.net/v1/Accept.js';
        this._rpc({
            route: '/payment/authorize/get_provider_info',
            params: {
                'provider_id': providerId,
            },
        }).then(providerInfo => {
            if (providerInfo.state !== 'enabled') {
                acceptJSUrl = 'https://jstest.authorize.net/v1/Accept.js';
            }
            this.authorizeInfo = providerInfo;
        }).then(() => {
            loadJS(acceptJSUrl);
        }).guardedCatch((error) => {
            error.event.preventDefault();
            this._displayErrorDialog(
                _t("An error occurred when displayed this payment form."),
                error.message.data.message,
            );
            this._enableButton();
        });
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

        if (!this._validateFormInputs(paymentOptionId, paymentMethodCode)) {
            this._enableButton(); // The submit button is disabled at this point, enable it
            return;
        }

        // Build the authentication and card data objects to be dispatched to Authorized.Net
        const secureData = {
            authData: {
                apiLoginID: this.authorizeInfo.login_id,
                clientKey: this.authorizeInfo.client_key,
            },
            ...this._getPaymentDetails(paymentOptionId, paymentMethodCode),
        };

        // Dispatch secure data to Authorize.Net to get a payment nonce in return
        Accept.dispatchData(
            secureData, response => this._responseHandler(response)
        );
    },

    /**
     * Checks that all payment inputs adhere to the DOM validation constraints.
     *
     * @private
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @return {boolean} - Whether all elements pass the validation constraints
     */
    _validateFormInputs(paymentOptionId, paymentMethodCode) {
        const inputs = Object.values(this._getInlineFormInputs(paymentOptionId, paymentMethodCode));
        return inputs.every(element => element.reportValidity());
    },

    /**
     * Return all relevant inline form inputs based on the payment method type of the provider.
     *
     * @private
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {Object} - An object mapping the name of inline form inputs to their DOM element
     */
    _getInlineFormInputs(paymentOptionId, paymentMethodCode) {
        const radio = this.el.querySelector('input[name="o_payment_radio"]:checked');
        const inlineForm = this._getInlineForm(radio)
        if (paymentMethodCode === 'card') {
            return {
                card: inlineForm.querySelector(`#o_authorize_card_${paymentOptionId}`),
                month: inlineForm.querySelector(`#o_authorize_month_${paymentOptionId}`),
                year: inlineForm.querySelector(`#o_authorize_year_${paymentOptionId}`),
                code: inlineForm.querySelector(`#o_authorize_code_${paymentOptionId}`),
            };
        } else {
            return {
                accountName: inlineForm.querySelector(
                    `#o_authorize_account_name_${paymentOptionId}`
                ),
                accountNumber: inlineForm.querySelector(
                    `#o_authorize_account_number_${paymentOptionId}`
                ),
                abaNumber: inlineForm.querySelector(`#o_authorize_aba_number_${paymentOptionId}`),
                accountType: inlineForm.querySelector(
                    `#o_authorize_account_type_${paymentOptionId}`
                ),
            };
        }
    },

    /**
     * Return the credit card or bank data to pass to the Accept.dispatch request.
     *
     * @private
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @return {Object} - Data to pass to the Accept.dispatch request
     */
    _getPaymentDetails(paymentOptionId, paymentMethodCode) {
        const inputs = this._getInlineFormInputs(paymentOptionId, paymentMethodCode);
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
     * @return {void}
     */
    _responseHandler(response) {
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

        // Create the transaction and retrieve the processing values
        this._rpc({
            route: this.txContext.transactionRoute,
            params: this._prepareTransactionRouteParams(),
        }).then(processingValues => {
            // Initiate the payment
            return this._rpc({
                route: '/payment/authorize/payment',
                params: {
                    'reference': processingValues.reference,
                    'partner_id': processingValues.partner_id,
                    'opaque_data': response.opaqueData,
                    'access_token': processingValues.access_token,
                }
            });
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
