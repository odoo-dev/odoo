/** @odoo-module **/

import core, { _t } from '@web/legacy/js/services/core';
import paymentForm from '@payment/js/payment_form';

paymentForm.include({
    events: Object.assign({}, paymentForm.prototype.events || {}, {
        'change .o_wpayment_fee_impact': '_onFeeParameterChange',
    }),

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

    /**
     * Update the fees associated to each provider.
     *
     * Called upon change of any parameter that might impact the fees (marked with
     * .o_wpayment_fee_impact).
     *
     * @private
     * @param {Event} ev
     * @return {void}
     */
    _onFeeParameterChange: function (ev) {
        const targetId = ev.target.id;
        if (targetId.indexOf('amount') >= 0) {
            this.txContext.amount = ev.target.value;
        }
        const providerIds = [];
        for (const card of this.$('.o_payment_option_card:has(.o_payment_fee)')) {
            const radio = $(card).find('input[name="o_payment_radio"]');
            if (radio.data('paymentOptionType') === 'provider') {
                providerIds.push(radio.data('paymentOptionId'));
            }
        }
        const countryId = this.$('select[name="country_id"]').val();
        if (providerIds && this.txContext.amount) {
            this._rpc({
                route: '/donation/get_provider_fees',
                params: {
                    'provider_ids': providerIds,
                    'amount': this.txContext.amount !== undefined
                        ? parseFloat(this.txContext.amount) : null,
                    'currency_id': this.txContext.currencyId
                        ? parseInt(this.txContext.currencyId) : null,
                    'country_id': countryId,
                },
            }).then(feesPerProvider => {
                for (const card of this.$('.o_payment_option_card:has(.o_payment_fee)')) {
                    const radio = $(card).find('input[name="o_payment_radio"]');
                    let providerId;
                    if (radio.data('paymentOptionType') === 'provider') {
                        providerId = radio.data('paymentOptionId');
                    } else { // token
                        providerId = radio.data('paymentProviderId');
                    }
                    const chunk = $(card).find('.o_payment_fee .oe_currency_value')[0];
                    chunk.innerText = (feesPerProvider[providerId] || 0).toFixed(2);
                }
            }).guardedCatch(error => {
                error.event.preventDefault();
                this._displayError(
                    _t("Server Error"),
                    _t("We could not obtain payment fees."),
                    error.message.data.message
                );
            });
        }
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
