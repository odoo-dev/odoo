/** @odoo-module **/

import core, { _t } from '@web/legacy/js/services/core';
import paymentForm from '@payment/js/payment_form';

paymentForm.include({

    // #=== WIDGET LIFECYCLE ===#

    /**
     * @override
     */
    async start() {
        core.bus.on('update_shipping_cost', this, this._updateShippingCost);
        return await this._super.apply(this, arguments);
    },

    // #=== EVENT HANDLERS ===#

    /**
     * Update the total amount to be paid.
     *
     * Called upon change of shipping method
     *
     * @private
     * @param {float} amount
     */
     _updateShippingCost: function (amount) {
        this.txContext.amount = amount;
     },

    // #=== PAYMENT FLOW ===#

    /**
     * Perform some validations for donations before processing the payment flow.
     *
     * @override method from @payment/js/payment_form
     * @private
     * @param {string} providerCode - The code of the selected payment option's provider.
     * @param {number} paymentOptionId - The id of the selected payment option.
     * @param {string} paymentMethodCode - The code of the selected payment method, if any.
     * @param {string} flow - The payment flow of the selected payment option.
     * @return {void}
     */
    async _initiatePaymentFlow(providerCode, paymentOptionId, paymentMethodCode, flow) {
        if ($('.o_donation_payment_form').length) {
            const errorFields = {};
            if (!this.$('input[name="email"]')[0].checkValidity()) {
                errorFields['email'] = _t("Email is invalid");
            }
            const mandatoryFields = {
                'name': _t('Name'),
                'email': _t('Email'),
                'country_id': _t('Country'),
            };
            for (const id in mandatoryFields) {
                const $field = this.$('input[name="' + id + '"],select[name="' + id + '"]');
                $field.removeClass('is-invalid').popover('dispose');
                if (!$field.val().trim()) {
                    errorFields[id] = _t("Field '%s' is mandatory", mandatoryFields[id]);
                }
            }
            if (Object.keys(errorFields).length) {
                for (const id in errorFields) {
                    const $field = this.$('input[name="' + id + '"],select[name="' + id + '"]');
                    $field.addClass('is-invalid');
                    $field.popover({content: errorFields[id], trigger: 'hover', container: 'body', placement: 'top'});
                }
                this._displayError(
                    _t("Validation Error"),
                    _t("Some information is missing to process your payment.")
                );
                return;
            }
        }
        this._super(...arguments);
    },

    /**
     * Add params used by the donation snippet for the RPC to the transaction route.
     *
     * @override method from @payment/js/payment_form
     * @private
     * @return {object} The extended transaction route params.
     */
    _prepareTransactionRouteParams() {
        const transactionRouteParams = this._super(...arguments);
        return $('.o_donation_payment_form').length ? {
            ...transactionRouteParams,
            'partner_details': {
                'name': this.$('input[name="name"]').val(),
                'email': this.$('input[name="email"]').val(),
                'country_id': this.$('select[name="country_id"]').val(),
            },
            'donation_comment': this.$('#donation_comment').val(),
            'donation_recipient_email': this.$('input[name="donation_recipient_email"]').val(),
        } : transactionRouteParams;
    },

});
