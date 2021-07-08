odoo.define('point_of_sale.CashOpeningPopup', function(require) {
    'use strict';

    const { useState, useRef} = owl.hooks;
    const { useListener } = require('web.custom_hooks');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');


    class CashOpeningPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.currency = this.env.pos.currency;
            this.previousClosingCash = 3500;
            const openingCash = this.env.pos.bank_statement.balance_start || 0;
            this.state = useState({
                notes: "",
                openingCashString: `${openingCash}`,
                coins: {'0.05': 0, '0.10': 0, '0.20': 0, '0.50': 0, '1.00': 0, '2.00': 0},
                bills: {'5': 0, '10': 0, '20': 0, '50': 0, '100': 0, '200': 0, '500': 0,},
                cashDifference: openingCash - this.previousClosingCash,
            });
            this.validKeys = new Set('0123456789.,'.split(''))
            this.detailsRefMap = { coins: {}, bills: {} }
            for (let key in this.state.coins) { this.detailsRefMap['coins'][key] = useRef(key) }
            for (let key in this.state.bills) { this.detailsRefMap['bills'][key] = useRef(key) }
            this.openingCashRef = useRef('openingCash');
            this.selectedDetailsRef = null;

            NumberBuffer.use({
                nonKeyboardInputEvent: 'numpad-click-input',
                triggerAtInput: 'accepted-input',
                allowInputTarget: true,
                inputKeys: this.validKeys,
            });
            useListener('accepted-input', this._updateSelectedAmount);
        }

        openDetailsPopup() {
            if ($('.opening-cash-details').hasClass('invisible')) {
                $('.opening-cash-details').removeClass('invisible');
                this._updateOpeningCashString('0');
                NumberBuffer.reset();
            }
        }

        startSession() {
            this.env.pos.bank_statement.balance_start = parseFloat(this.state.cashBoxValue);
            this.env.pos.pos_session.state = 'opened';
            this.rpc({
                   model: 'pos.session',
                    method: 'set_cashbox_pos',
                    args: [this.env.pos.pos_session.id, parseFloat(this.state.cashBoxValue), this.state.notes],
                });
            this.trigger('close-popup');
        }

        sendInput(key) {
            this.trigger('numpad-click-input', { key });
        }

        onInputClick(value, type) {
            const ref = this.detailsRefMap[type][value];
            if (this.selectedDetailsRef && this.selectedDetailsRef.ref !== ref) {
                if (!this.state[this.selectedDetailsRef.type][this.selectedDetailsRef.value]) {
                    this.state[this.selectedDetailsRef.type][this.selectedDetailsRef.value] = 0;
                }
                this.selectedDetailsRef.ref.el.classList.remove('selected', 'highlight');
            }
            this.selectedDetailsRef = { ref, type, value }
            this.selectedDetailsRef.ref.el.classList.add('selected', 'highlight');
            NumberBuffer.reset();
        }
        _updateOpeningCashString(value) {
            this.state.openingCashString = value;
            this.state.cashDifference = parseFloat(this.state.openingCashString) - this.previousClosingCash;
        }
        _updateSelectedAmount(event) {
            if (this.selectedDetailsRef) {
                const selectedDetailsValue = this.state[this.selectedDetailsRef.type][this.selectedDetailsRef.value];
                if (!event.detail.buffer || ([event.detail.key, selectedDetailsValue].every(value => value === '0'))) {
                    NumberBuffer.reset();
                    this.state[this.selectedDetailsRef.type][this.selectedDetailsRef.value] = 0;
                } else if (event.detail.key === '.') {
                    NumberBuffer.set(`${selectedDetailsValue}`);
                    return;
                } else {
                    this.state[this.selectedDetailsRef.type][this.selectedDetailsRef.value] = parseInt(event.detail.buffer);
                }
                this.selectedDetailsRef.ref.el.classList.remove('highlight');
            } else {
                if (!event.detail.buffer || ([event.detail.key, this.state.openingCashString].every(value => value === '0'))) {
                    NumberBuffer.reset();
                    this._updateOpeningCashString('0');
                } else {
                    this._updateOpeningCashString(event.detail.buffer);
                }
            }
        }
        _closeDetailsPopup() {
            $('.opening-cash-details').toggleClass('invisible');
            if (this.selectedDetailsRef) {
                this.selectedDetailsRef.ref.el.classList.remove('selected', 'highlight');
                this.selectedDetailsRef = null;
            }
        }
        computeOpeningCash() {
            let openingCash = 0;
            for (const [moneyValue, amount] of Object.entries(this.state.coins).concat(Object.entries(this.state.bills))) {
                openingCash += parseFloat(moneyValue) * amount;
            }
            this._updateOpeningCashString(`${openingCash}`);
            NumberBuffer.set(this.state.openingCashString);
            this._fillNotesWithMoneyDetails();
            this._closeDetailsPopup();
        }
        resetDetails() {
            this._closeDetailsPopup();
            for (let key in this.state.coins) { this.state.coins[key] = 0 }
            for (let key in this.state.bills) { this.state.bills[key] = 0 }
        }
        _fillNotesWithMoneyDetails() {
            let notes = 'Money details: \n';
            for (let key in this.state.coins) { if (this.state.coins[key]) notes += `  - ${this.state.coins[key]} x ${key}\n` }
            for (let key in this.state.bills) { if (this.state.bills[key]) notes += `  - ${this.state.bills[key]} x ${key}\n` }
            this.state.notes = notes;
        }
    }

    CashOpeningPopup.template = 'CashOpeningPopup';
    Registries.Component.add(CashOpeningPopup);

    return CashOpeningPopup;
});
