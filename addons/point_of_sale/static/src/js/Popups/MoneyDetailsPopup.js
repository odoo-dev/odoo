odoo.define('point_of_sale.MoneyDetailsPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { float_is_zero } = require('web.utils');

    /**
     * Even if this component has a "confirm and cancel"-like buttons, this should not be an AbstractAwaitablePopup.
     * We currently cannot show two popups at the same time, what we do is mount this component with its parent
     * and hide it with some css. The confirm button will just trigger an event to the parent.
     */
    class MoneyDetailsPopup extends PosComponent {
        constructor() {
            super(...arguments);
            this.currency = this.env.pos.currency;
            this.state = useState(this._getStartingMoneyDetails());
            this.inputRefs = {}
            for (let key in this.state.moneyDetails) { this.inputRefs[key] = useRef(key) }

        }
        get firstHalfMoneyDetails() {
            const moneyDetailsKeys = Object.keys(this.state.moneyDetails).sort((a, b) => a - b);
            return moneyDetailsKeys.slice(0, moneyDetailsKeys.length/2);
        }
        get lastHalfMoneyDetails() {
            const moneyDetailsKeys = Object.keys(this.state.moneyDetails).sort((a, b) => a - b);
            return moneyDetailsKeys.slice(moneyDetailsKeys.length/2, moneyDetailsKeys.length);
        }
        _amountIsZero(amount) {
            return float_is_zero(amount, this.env.pos.currency.decimals)
        }
        /**
         * This function loops thru each bill to assign count to it. The count will come
         * from the previous session's closing cashbox. Since the lines of the cashbox
         * is not indexed by "bill value", we loop thru each line to find the corresponding
         * count.
         * Yes, this is O(N x M).
         * But it only involves few array items so performance won't be an issue.
         */
        _getStartingMoneyDetails() {
            const valueCountPairs = [];
            let initTotal = 0;
            for (const bill of this.env.pos.bills) {
                let isFound = false;
                // lastSessionClosingCashboxLines can be undefined if there is no last session's cashbox
                for (const line of (this.env.pos.lastSessionClosingCashboxLines || [])) {
                    if (this._amountIsZero(line.coin_value - bill.value)) {
                        valueCountPairs.push([bill.value, line.number])
                        initTotal += bill.value * line.number;
                        isFound = true;
                        break;
                    }
                }
                if (!isFound) {
                    valueCountPairs.push([bill.value, 0]);
                }
            }
            return {
              moneyDetails: Object.fromEntries(valueCountPairs),
              total: initTotal,
            };
        }
        isClosed() {
            return this.el.classList.contains('invisible')
        }
        openPopup() {
            this.el.classList.remove('invisible');
        }
        /**
         * The OWL framework has a known bug (https://github.com/odoo/owl/issues/700) where the t-model and the
         * t-on-input aren't working properly together. We still have to manually change the value of the t-model
         */
        updateMoneyDetailsAmount(moneyValue) {
            const value = this.inputRefs[moneyValue].el.value;
            const floatValue = parseFloat(value);
            if (!isNaN(floatValue) || !value) { // if !value, it means value = '' and thus we replace it with 0
                const value = parseFloat(moneyValue);
                const difference = ((floatValue || 0)  - this.state.moneyDetails[moneyValue]) * value;
                this.state.moneyDetails[moneyValue] = floatValue || 0;
                this.state.total = this.state.total + difference;
            }
        }
        _closePopup() {
            this.el.classList.add('invisible');
        }
        confirm() {
            let moneyDetails = this.state.total  ? 'Money details: \n' : null;
            for (let key in this.state.moneyDetails) {
                if (this.state.moneyDetails[key]) {
                    moneyDetails += `  - ${this.state.moneyDetails[key]} x ${this.env.pos.format_currency(key)}\n`;
                }
            }
            const payload = { total: this.state.total, moneyDetails }
            this.trigger('money-details-validated', payload)
            this._closePopup();
        }
        discard() {
            for (let key in this.state.moneyDetails) { this.state.moneyDetails[key] = 0 }
            this.state.total = 0;
            this._closePopup();
        }
    }

    MoneyDetailsPopup.template = 'MoneyDetailsPopup';
    Registries.Component.add(MoneyDetailsPopup);

    return MoneyDetailsPopup;

});