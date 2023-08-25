/** @odoo-module **/
/* global AdyenCheckout */

import { _t } from '@web/core/l10n/translation';
import paymentForm from '@payment/js/payment_form';

paymentForm.include({

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    adyenCheckout: undefined,
    adyenComponents: undefined,

    // #=== DOM MANIPULATION ===#

    /**
     * Prepare the inline form of Adyen for direct payment.
     *
     * @override method from payment.payment_form
     * @private
     * @param {number} providerId - The id of the selected payment option's provider.
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the selected payment option
     * @return {void}
     */
    async _prepareInlineForm(providerId, providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'adyen') {
            this._super(...arguments);
            return;
        }

        // Check if instantiation of the component is needed.
        this.adyenComponents ??= {}; // Store the component of each instantiated payment method.
        if (flow === 'token') {
            return; // No component for tokens.
        } else if (this.adyenComponents[paymentOptionId]) {
            this._setPaymentFlow('direct'); // Overwrite the flow even if no re-instantiation.
            if (paymentMethodCode === 'paypal') { // PayPal uses its own button to submit.
                this._hideInputs();
            }
            return; // Don't re-instantiate if already done for this payment method.
        }

        // Overwrite the flow of the selected payment method.
        this._setPaymentFlow('direct');

        // Extract and deserialize the inline form values.
        const radio = document.querySelector('input[name="o_payment_radio"]:checked');
        const adyenInlineFormValues = JSON.parse(radio.dataset['inlineFormValues']);

        // Create the checkout object if not already done for another payment method.
        if (!this.adyenCheckout) {
            await this._rpc({ // Await the RPC to let it create AdyenCheckout before using it.
                route: '/payment/adyen/payment_methods',
                params: {
                    'provider_id': providerId,
                    'partner_id': parseInt(this.txContext.partnerId),
                    'amount': this.txContext.amount
                        ? parseFloat(this.txContext.amount)
                        : undefined,
                    'currency_id': this.txContext.currencyId
                        ? parseInt(this.txContext.currencyId)
                        : undefined,
                },
            }).then(async response => {
                // Create the Adyen Checkout SDK.
                const providerState = this._getProviderState(radio);
                const configuration = {
                    paymentMethodsResponse: response,
                    clientKey: adyenInlineFormValues['client_key'],
                    locale: (this._getContext().lang || 'en-US').replace('_', '-'),
                    environment: providerState === 'enabled' ? 'live' : 'test',
                    onAdditionalDetails: this._adyenOnSubmitAdditionalDetails.bind(this),
                    onError: this._adyenOnError.bind(this),
                    onSubmit: this._adyenOnSubmit.bind(this),
                };
                this.adyenCheckout = await AdyenCheckout(configuration);
            }).guardedCatch((error) => {
                error.event.preventDefault();
                this._displayErrorDialog(
                    _t("Cannot display the payment form"), error.message.data.message
                );
                this._enableButton();
            });
        }

        // Instantiate and mount the component.
        const componentConfiguration = {
            showBrandsUnderCardNumber: false,
            showPayButton: false,
            billingAddressRequired: false, // The billing address is included in the request.
        };
        if (paymentMethodCode === 'card') {
            // Forbid Bancontact cards in the card component.
            componentConfiguration['brands'] = ['mc', 'visa', 'amex', 'discover'];
        }
        else if (paymentMethodCode === 'paypal') {
            // PayPal requires the form to be submitted with its own button.
            Object.assign(componentConfiguration, {
                style: {
                    disableMaxWidth: true
                },
                showPayButton: true,
                blockPayPalCreditButton: true,
                blockPayPalPayLaterButton: true
            });
            this._hideInputs();
            // Define necessary fields as the step _submitForm is missed.
            Object.assign(this.txContext, {
                tokenizationRequested: false,
                providerId: providerId,
                paymentMethodId: paymentOptionId,
            });
        }
        const inlineForm = this._getInlineForm(radio);
        const adyenContainer = inlineForm.querySelector('[name="o_adyen_component_container"]');
        this.adyenComponents[paymentOptionId] = this.adyenCheckout.create(
            adyenInlineFormValues['adyen_pm_code'], componentConfiguration
        ).mount(adyenContainer);
    },

    // #=== PAYMENT FLOW ===#

    /**
     * Trigger the payment processing by submitting the component.
     *
     * @override method from payment.payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the payment option handling the transaction.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The online payment flow of the transaction.
     * @return {void}
     */
    _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'adyen' || flow === 'token') {
            this._super(...arguments); // Tokens are handled by the generic flow
            return;
        }

        // The `onError` event handler is not used to validate inputs anymore since v5.0.0.
        if (!this.adyenComponents[paymentOptionId].isValid) {
            this._displayErrorDialog(_t("Incorrect payment details"));
            this._enableButton();
            return;
        }
        this.adyenComponents[paymentOptionId].submit(); // TODO VCHU split like in authorize
    },

    /**
     * Handle the submit event of the component and initiate the payment.
     *
     * @private
     * @param {object} state - The state of the component.
     * @param {object} component - The component.
     * @return {void}
     */
    _adyenOnSubmit(state, component) {
        // Create the transaction and retrieve the processing values.
        this._rpc({
            route: this.txContext['transactionRoute'],
            params: this._prepareTransactionRouteParams(),
        }).then(processingValues => {
            component.reference = processingValues.reference; // Store final reference.
            // Initiate the payment.
            return this._rpc({
                route: '/payment/adyen/payments',
                params: {
                    'provider_id': processingValues.provider_id,
                    'reference': processingValues.reference,
                    'converted_amount': processingValues.converted_amount,
                    'currency_id': processingValues.currency_id,
                    'partner_id': processingValues.partner_id,
                    'payment_method': state.data.paymentMethod,
                    'access_token': processingValues.access_token,
                    'browser_info': state.data.browserInfo,
                },
            });
        }).then(paymentResponse => {
            if (paymentResponse.action) { // An additional action is required from the shopper.
                this._hideInputs(); // Only the inputs of the inline form should be used.
                this.call('ui', 'unblock'); // The page is blocked at this point, unblock it.
                component.handleAction(paymentResponse.action);
            } else { // The payment reached a final state; redirect to the status page.
                window.location = '/payment/status';
            }
        }).guardedCatch((error) => {
            error.event.preventDefault();
            this._displayErrorDialog(_t("Payment processing failed"), error.message.data.message);
            this._enableButton();
        });
    },

    /**
     * Handle the additional details event of the component.
     *
     * @private
     * @param {object} state - The state of the component.
     * @param {object} component - The component.
     * @return {void}
     */
    _adyenOnSubmitAdditionalDetails(state, component) {
        this._rpc({
            route: '/payment/adyen/payments/details',
            params: {
                'provider_id': this.txContext.providerId,
                'reference': component.reference,
                'payment_details': state.data,
            },
        }).then(paymentDetails => {
            if (paymentDetails.action) { // Additional action required from the shopper.
                component.handleAction(paymentDetails.action);
            } else { // The payment reached a final state; redirect to the status page.
                window.location = '/payment/status';
            }
        }).guardedCatch((error) => {
            error.event.preventDefault();
            this._displayErrorDialog(_t("Payment processing failed"), error.message.data.message);
            this._enableButton();
        });
    },

    /**
     * Handle the error event of the component.
     *
     * See https://docs.adyen.com/online-payments/build-your-integration/?platform=Web
     * &integration=Components&version=5.49.1#handle-the-redirect.
     *
     * @private
     * @param {object} error - The error in the component.
     * @return {void}
     */
    _adyenOnError(error) {
        this._displayErrorDialog(_t("Payment processing failed"), error.message);
        this._enableButton();
    },

});
