/** @odoo-module */
/* global Stripe */

import { _t } from '@web/core/l10n/translation';
import { StripeOptions } from '@payment_stripe/js/stripe_options';
import paymentForm from '@payment/js/payment_form';

paymentForm.include( {

    /**
     * Prepare the inline form of Stripe for direct payment.
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
        if (providerCode !== 'stripe') {
            this._super(...arguments);
            return;
        }

        // Check if instantiation of the element is needed.
        this.stripePaymentElements ??= {}; // Store the element of each instantiated payment method.
        // Check if instantiation of the element is needed.
        if (flow === 'token') {
            return; // No elements for tokens.
        } else if (this.stripePaymentElements[paymentOptionId]) {
            this._setPaymentFlow('direct'); // Overwrite the flow even if no re-instantiation.
            return; // Don't re-instantiate if already done for this provider.
        }

        // Overwrite the flow of the select payment option.
        this._setPaymentFlow('direct');

        const radio = document.querySelector('input[name="o_payment_radio"]:checked');
        const inlineForm = this._getInlineForm(radio);
        const stripeInlineForm = inlineForm.querySelector('[name="o_stripe_element_container"]');
        this.isValidation = Boolean(this.txContext['mode'] === 'validation');
        this.stripeInlineFormValues = JSON.parse(radio.dataset['inlineFormValues']);
        this.stripeInlineFormValues.paymentMethodTypes = [paymentMethodCode];

        // Instantiate the payment element.
        this.stripeJS = Stripe(
            this.stripeInlineFormValues['publishable_key'],
            // The values required by Stripe Connect are inserted into the dataset.
            new StripeOptions()._prepareStripeOptions(stripeInlineForm.dataset),
        );
        this.stripePaymentElements[paymentOptionId] = this.stripeJS.elements(
            this._getElementsOptions()
        );
        const paymentElementOptions = {
            defaultValues: {
                billingDetails: this.stripeInlineFormValues['billing_details'],
            },
        };
        const paymentElement = this.stripePaymentElements[paymentOptionId].create(
            'payment', paymentElementOptions
        );
        paymentElement.mount(stripeInlineForm);

        const tokenizationCheckbox = inlineForm.querySelector(
            "input[name='o_payment_tokenize_checkbox']"
        );
        if (tokenizationCheckbox) {
            // Display tokenization-specific inputs when the tokenization checkbox is checked.
            tokenizationCheckbox.addEventListener('input', () => {
                this.stripePaymentElements[paymentOptionId].update({
                    setupFutureUsage: tokenizationCheckbox.checked ? 'off_session' : null,
                });
            });
        }
    },

    /**
     * Prepare the required options for the configuration of the Elements object.
     *
     * @private
     * @return {Object}
     */
    _getElementsOptions() {
        let options =  {
            appearance: { theme: 'stripe' },
            currency: this.stripeInlineFormValues['currency_name'],
            captureMethod: this.stripeInlineFormValues['capture_method'],
            paymentMethodTypes: this.stripeInlineFormValues['paymentMethodTypes'],
        };
        if (this.isValidation){
            options.mode = 'setup';
            options.setupFutureUsage = 'off_session';
        }
        else {
            options.mode = 'payment';
            options.amount = parseInt(this.stripeInlineFormValues['minor_amount']);
            if (this.stripeInlineFormValues['is_tokenization_required']) {
                options.setupFutureUsage = 'off_session';
            }
        }
        return options;
    },

    /* @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The payment flow of the selected payment option.
     * @return {void}
     */
    async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if (providerCode !== 'stripe' || flow === 'token') {
            await this._super(...arguments); // Tokens are handled by the generic flow.
            return;
        }
        if (this.stripePaymentElements[paymentOptionId] === undefined) { // Elements has not been properly instantiated.
            this._displayErrorDialog(
                _t("Server Error"), _t("We are not able to process your payment.")
            );
            this._enableButton();
        } else {
            // Trigger form validation and wallet collection.
            const _super = this._super.bind(this);
            const { error: submitError } = await this.stripePaymentElements[paymentOptionId].submit();
            if (submitError) {
                this._displayErrorDialog(
                    _t("Incorrect Payment Details"),
                    _t("Please verify your payment details."),
                );
                this._enableButton();
            } else { // There is no invalid input, resume the generic flow.
                return await _super(...arguments);
            }
        }
    },

    /**
     * Process Stripe implementation of the direct payment flow.
     *
     * @override method from payment.payment_form_mixin
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {object} processingValues - The processing values of the transaction.
     * @return {void}
     */
    async _processDirectFlow(providerCode, paymentOptionId, paymentMethodCode, processingValues) {
        if (providerCode !== 'stripe') {
            await this._super(...arguments);
            return;
        }

        const { error } = await this._stripeConfirmIntent(processingValues, paymentOptionId);
        if (error) {
            this._displayErrorDialog(
                _t("Server Error"),
                _t("We are not able to process your payment."),
                error.message,
            );
            this._enableButton();
        }
    },

    /**
     * Confirm the intent on Stripe's side and handle any next action.
     *
     * @private
     * @param {object} processingValues - The processing values of the transaction.
     * @param {number} paymentOptionId - The id of the payment option handling the transaction.
     * @return {object} The processing error, if any.
     */
    async _stripeConfirmIntent(processingValues, paymentOptionId) {
        const elementOptions = {
            elements: this.stripePaymentElements[paymentOptionId],
            clientSecret: processingValues['client_secret'],
            confirmParams: {
                return_url: processingValues['return_url'],
            },
        }
        if (this.isValidation){
             return await this.stripeJS.confirmSetup(elementOptions);
        }
        else {
            return await this.stripeJS.confirmPayment(elementOptions);
        }
    },

});
