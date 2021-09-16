odoo.define('point_of_sale.ClosePosPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const { identifyError } = require('point_of_sale.utils');
    const { ConnectionLostError } = require('@web/core/network/rpc_service')
    const { round_precision: round_pr } = require('web.utils');

    /**
     * This popup needs to be self-dependent because it needs to be called from different place.
     */
    class ClosePosPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.manualInputCashCount = true;
            this.cashControl = this.env.pos.config.cash_control;
            this.moneyDetailsRef = useRef('moneyDetails');
            this.closeSessionClicked = false;
            this.moneyDetails = null;
        }
        async willStart() {
            try {
                const closingData = await this.rpc({
                    model: 'pos.session',
                    method: 'get_closing_control_data',
                    args: [[this.env.pos.pos_session.id]]
                });
                this.ordersDetails = closingData.orders_details;
                this.paymentsAmount = closingData.payments_amount;
                this.payLaterAmount = closingData.pay_later_amount;
                this.openingNotes = closingData.opening_notes;
                this.defaultCashDetails = closingData.default_cash_details;
                this.otherPaymentMethods = closingData.other_payment_methods;

                this.inputRefs = {}
                // component state and refs definition
                const state = {notes: '', acceptClosing: false};
                if (this.cashControl) {
                    state[this.defaultCashDetails.name] = {counted: 0, difference: -this.defaultCashDetails.amount};
                    this.inputRefs[this.defaultCashDetails.name] = useRef(this.defaultCashDetails.name);
                }
                if (this.otherPaymentMethods.length > 0) {
                    this.otherPaymentMethods.forEach(pm => {
                        state[pm.name] = {counted: pm.amount, difference: 0}
                        this.inputRefs[pm.name] = useRef(pm.name);
                    })
                }
                this.state = useState(state);
            } catch (error) {
                this.error;
            }
        }
        /*
         * Since this popup need to be self dependent, in case of an error, the popup need to be closed on its own.
         */
        mounted() {
            if (this.error) {
                this.cancel();
                if (this.error.message instanceof ConnectionLostError) {
                    this.showPopup('ErrorPopup', {
                        title: this.env._t('Network Error'),
                        body: this.env._t('Please check your internet connection and try again.'),
                    });
                } else {
                    throw this.error;
                }
            }
        }
        openDetailsPopup() {
            if (this.moneyDetailsRef.comp.isClosed()){
                this.moneyDetailsRef.comp.openPopup();
                this.state[this.defaultCashDetails.name].counted = 0;
                if (this.manualInputCashCount) {
                    this.moneyDetailsRef.comp.reset();
                }
            }
        }
        /**
         * The OWL framework has a known bug (https://github.com/odoo/owl/issues/700) where the t-model and the
         * t-on-input aren't working properly together. We still have to manually change the value of the t-model
         */
        handleInputChange(paymentName) {
            const value = this.inputRefs[paymentName].el.value;
            const floatValue = parseFloat(value);
            if (!isNaN(floatValue) || !value) { // if !value, it means value = '' and thus we replace it with 0
                this.state[paymentName].counted = floatValue || 0;
                let expectedAmount;
                if (paymentName === this.defaultCashDetails.name) {
                    this.manualInputCashCount = true;
                    expectedAmount = this.defaultCashDetails.amount;
                    this.state.notes = '';
                } else {
                    expectedAmount = this.otherPaymentMethods.find(paymentMethod => paymentMethod.name == paymentName).amount;
                }
                this.state[paymentName].difference = this.state[paymentName].counted - expectedAmount;
            }
        }
        updateCountedCash(event) {
            const { total, moneyDetailsNotes, moneyDetails } = event.detail;
            this.state[this.defaultCashDetails.name].counted = round_pr(total, this.env.pos.currency.rounding);
            this.state[this.defaultCashDetails.name].difference = this.state[[this.defaultCashDetails.name]].counted - this.defaultCashDetails.amount;
            if (moneyDetailsNotes) {
                this.state.notes = moneyDetailsNotes;
            }
            this.manualInputCashCount = false;
            this.moneyDetails = moneyDetails;
        }
        canCloseSession() {
            return !this.cashControl || !this.state[this.defaultCashDetails.name].difference || this.state.acceptClosing;
        }
        closePos() {
            this.trigger('close-pos');
        }
        async closeSession() {
            if (this.canCloseSession() && !this.closeSessionClicked) {
                try {
                    let successful, reason;
                    [successful, reason] = await this.rpc({
                        model: 'pos.session',
                        method: 'post_closing_cash_details',
                        args: [[this.env.pos.pos_session.id]],
                        kwargs: {
                            counted_cash: this.manualInputCashCount ? this.state[this.defaultCashDetails.name].counted : null,
                            bill_details: this.manualInputCashCount ? null : Object.entries(this.moneyDetails)
                        }
                    })
                    if (!successful) {
                        await this.showPopup('ErrorPopup', {title: 'Error', body: reason});
                        return;
                    }
                    [successful, reason] = await this.rpc({
                        model: 'pos.session',
                        method: 'close_session_from_ui',
                        args: [this.env.pos.pos_session.id],
                    });
                    if (!successful) {
                        await this.showPopup('ErrorPopup', {title: 'Error', body: reason});
                    }
                    window.location = '/web#action=point_of_sale.action_client_pos_menu';
                } catch (error) {
                    const iError = identifyError(error);
                    if (iError instanceof ConnectionLostError) {
                        await this.showPopup('ErrorPopup', {
                            title: this.env._t('Network Error'),
                            body: this.env._t('Cannot close the session when offline.'),
                        });
                    } else {
                        throw error;
                    }
                }
            }
        }
    }

    ClosePosPopup.template = 'ClosePosPopup';
    Registries.Component.add(ClosePosPopup);

    return ClosePosPopup;
});
