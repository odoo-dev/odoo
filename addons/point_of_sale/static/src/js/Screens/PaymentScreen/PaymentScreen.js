odoo.define('point_of_sale.PaymentScreen', function (require) {
    'use strict';

    const { parse } = require('web.field_utils');
    const PosComponent = require('point_of_sale.PosComponent');
    const { useErrorHandlers } = require('point_of_sale.custom_hooks');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { useListener } = require("@web/core/utils/hooks");
    const Registries = require('point_of_sale.Registries');
    const { isConnectionError } = require('point_of_sale.utils');

    class PaymentScreen extends PosComponent {
        setup() {
            super.setup();
            useListener('delete-payment-line', this.deletePaymentLine);
            useListener('select-payment-line', this.selectPaymentLine);
            useListener('new-payment-line', this.addNewPaymentLine);
            useListener('update-selected-paymentline', this._updateSelectedPaymentline);
            useListener('send-payment-request', this._sendPaymentRequest);
            useListener('send-payment-cancel', this._sendPaymentCancel);
            useListener('send-payment-reverse', this._sendPaymentReverse);
            useListener('send-force-done', this._sendForceDone);
            useListener('validate-order', () => this.validateOrder(false));
            NumberBuffer.use({
                // The numberBuffer listens to this event to update its state.
                // Basically means 'update the buffer when this event is triggered'
                nonKeyboardInputEvent: 'input-from-numpad',
                // When the buffer is updated, trigger this event.
                // Note that the component listens to it.
                triggerAtInput: 'update-selected-paymentline',
            });
            useErrorHandlers();
            this.payment_interface = null;
            this.error = false;
            this.payment_methods_from_config = this.env.pos.payment_methods.filter(method => this.env.pos.config.payment_method_ids.includes(method.id));
        }
        get currentOrder() {
            return this.env.pos.get_order();
        }
        get paymentLines() {
            return this.currentOrder.get_paymentlines();
        }
        get selectedPaymentLine() {
            return this.currentOrder.selected_paymentline;
        }
        async selectClient() {
            // IMPROVEMENT: This code snippet is repeated multiple times.
            // Maybe it's better to create a function for it.
            const currentClient = this.currentOrder.get_client();
            const { confirmed, payload: newClient } = await this.showTempScreen(
                'ClientListScreen',
                { client: currentClient }
            );
            if (confirmed) {
                this.currentOrder.set_client(newClient);
                this.currentOrder.updatePricelist(newClient);
            }
        }
        addNewPaymentLine({ detail: paymentMethod }) {
            // original function: click_paymentmethods
            if (this.currentOrder.electronic_payment_in_progress()) {
                this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('There is already an electronic payment in progress.'),
                });
                return false;
            } else {
                this.currentOrder.add_paymentline(paymentMethod);
                NumberBuffer.reset();
                this.payment_interface = paymentMethod.payment_terminal;
                if (this.payment_interface) {
                    this.currentOrder.selected_paymentline.set_payment_status('pending');
                }
                return true;
            }
        }
        _updateSelectedPaymentline() {
            if (this.paymentLines.every((line) => line.paid)) {
                this.currentOrder.add_paymentline(this.payment_methods_from_config[0]);
            }
            if (!this.selectedPaymentLine) return; // do nothing if no selected payment line
            // disable changing amount on paymentlines with running or done payments on a payment terminal
            const payment_terminal = this.selectedPaymentLine.payment_method.payment_terminal;
            if (
                payment_terminal &&
                !['pending', 'retry'].includes(this.selectedPaymentLine.get_payment_status())
            ) {
                return;
            }
            if (NumberBuffer.get() === null) {
                this.deletePaymentLine({ detail: { cid: this.selectedPaymentLine.cid } });
            } else {
                this.selectedPaymentLine.set_amount(NumberBuffer.getFloat());
            }
        }
        toggleIsToInvoice() {
            // click_invoice
            this.currentOrder.set_to_invoice(!this.currentOrder.is_to_invoice());
            this.render();
        }
        openCashbox() {
            this.env.proxy.printer.open_cashbox();
        }
        async addTip() {
            // click_tip
            const tip = this.currentOrder.get_tip();
            const change = this.currentOrder.get_change();
            let value = tip === 0 && change > 0 ? change : tip;

            const { confirmed, payload } = await this.showPopup('NumberPopup', {
                title: tip ? this.env._t('Change Tip') : this.env._t('Add Tip'),
                startingValue: value,
                isInputSelected: true,
            });

            if (confirmed) {
                this.currentOrder.set_tip(parse.float(payload));
            }
        }
        toggleIsToShip() {
            // click_ship
            this.currentOrder.set_to_ship(!this.currentOrder.is_to_ship());
            this.render();
        }
        deletePaymentLine(event) {
            var self = this;
            const { cid } = event.detail;
            const line = this.paymentLines.find((line) => line.cid === cid);

            // If a paymentline with a payment terminal linked to
            // it is removed, the terminal should get a cancel
            // request.
            if (['waiting', 'waitingCard', 'timeout'].includes(line.get_payment_status())) {
                line.set_payment_status('waitingCancel');
                line.payment_method.payment_terminal.send_payment_cancel(this.currentOrder, cid).then(function() {
                    self.currentOrder.remove_paymentline(line);
                    NumberBuffer.reset();
                    self.render();
                })
            }
            else if (line.get_payment_status() !== 'waitingCancel') {
                this.currentOrder.remove_paymentline(line);
                NumberBuffer.reset();
                this.render();
            }
        }
        selectPaymentLine(event) {
            const { cid } = event.detail;
            const line = this.paymentLines.find((line) => line.cid === cid);
            this.currentOrder.select_paymentline(line);
            NumberBuffer.reset();
            this.render();
        }
        async validateOrder(isForceValidate) {
            if(this.env.pos.config.cash_rounding) {
                if(!this.env.pos.get_order().check_paymentlines_rounding()) {
                    this.showPopup('ErrorPopup', {
                        title: this.env._t('Rounding error in payment lines'),
                        body: this.env._t("The amount of your payment lines must be rounded to validate the transaction."),
                    });
                    return;
                }
            }
            if (await this._isOrderValid(isForceValidate)) {
                // remove pending payments before finalizing the validation
                for (let line of this.paymentLines) {
                    if (!line.is_done()) this.currentOrder.remove_paymentline(line);
                }
                await this._finalizeValidation();
            }
        }
        async _finalizeValidation() {
            if ((this.currentOrder.is_paid_with_cash() || this.currentOrder.get_change()) && this.env.pos.config.iface_cashdrawer) {
                this.env.proxy.printer.open_cashbox();
            }

            this.currentOrder.initialize_validation_date();
            this.currentOrder.finalized = true;

            let syncOrderResult, hasError;

            try {
                // 1. Save order to server.
                syncOrderResult = await this.env.pos.push_single_order(this.currentOrder);

                // 2. Invoice.
                if (this.currentOrder.is_to_invoice()) {
                    if (syncOrderResult.length) {
                        await this.env.legacyActionManager.do_action('account.account_invoices', {
                            additional_context: {
                                active_ids: [syncOrderResult[0].account_move],
                            },
                        });
                    } else {
                        throw { code: 401, message: 'Backend Invoice', data: { order: this.currentOrder } };
                    }
                }

                // 3. Post process.
                if (syncOrderResult.length && this.currentOrder.wait_for_push_order()) {
                    const postPushResult = await this._postPushOrderResolve(
                        this.currentOrder,
                        syncOrderResult.map((res) => res.id)
                    );
                    if (!postPushResult) {
                        this.showPopup('ErrorPopup', {
                            title: this.env._t('Error: no internet connection.'),
                            body: this.env._t('Some, if not all, post-processing after syncing order failed.'),
                        });
                    }
                }
            } catch (error) {
                hasError = true;

                if (error.code == 700)
                    this.error = true;

                if ('code' in error) {
                    // We started putting `code` in the rejected object for invoicing error.
                    // We can continue with that convention such that when the error has `code`,
                    // then it is an error when invoicing. Besides, _handlePushOrderError was
                    // introduce to handle invoicing error logic.
                    await this._handlePushOrderError(error);
                } else {
                    // We don't block for connection error. But we rethrow for any other errors.
                    if (isConnectionError(error)) {
                        this.showPopup('OfflineErrorPopup', {
                            title: this.env._t('Connection Error'),
                            body: this.env._t('Order is not synced. Check your internet connection'),
                        });
                    } else {
                        throw error;
                    }
                }
            } finally {
                // Always show the next screen regardless of error since pos has to
                // continue working even offline.
                this.showScreen(this.nextScreen);

                // Ask the user to sync the remaining unsynced orders.
                if (!hasError && syncOrderResult && this.env.pos.db.get_orders().length) {
                    const { confirmed } = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Remaining unsynced orders'),
                        body: this.env._t(
                            'There are unsynced orders. Do you want to sync these orders?'
                        ),
                    });
                    if (confirmed) {
                        // NOTE: Not yet sure if this should be awaited or not.
                        // If awaited, some operations like changing screen
                        // might not work.
                        this.env.pos.push_orders();
                    }
                }
            }
        }
        get nextScreen() {
            return !this.error? 'ReceiptScreen' : 'ProductScreen';
        }
        async _isOrderValid(isForceValidate) {
            if (this.currentOrder.get_orderlines().length === 0 && this.currentOrder.is_to_invoice()) {
                this.showPopup('ErrorPopup', {
                    title: this.env._t('Empty Order'),
                    body: this.env._t(
                        'There must be at least one product in your order before it can be validated and invoiced.'
                    ),
                });
                return false;
            }

            const splitPayments = this.paymentLines.filter(payment => payment.payment_method.split_transactions)
            if (splitPayments.length && !this.currentOrder.get_client()) {
                const paymentMethod = splitPayments[0].payment_method
                const { confirmed } = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Customer Required'),
                    body: _.str.sprintf(this.env._t('Customer is required for %s payment method.'), paymentMethod.name),
                });
                if (confirmed) {
                    this.selectClient();
                }
                return false;
            }

            if ((this.currentOrder.is_to_invoice() || this.currentOrder.is_to_ship()) && !this.currentOrder.get_client()) {
                const { confirmed } = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please select the Customer'),
                    body: this.env._t(
                        'You need to select the customer before you can invoice or ship an order.'
                    ),
                });
                if (confirmed) {
                    this.selectClient();
                }
                return false;
            }

            var customer = this.currentOrder.get_client()
            if (this.currentOrder.is_to_ship() && !(customer.name && customer.street && customer.city && customer.country_id)) {
                this.showPopup('ErrorPopup', {
                    title: this.env._t('Incorrect address for shipping'),
                    body: this.env._t('The selected customer needs an address.'),
                });
                return false;
            }

            if (!this.currentOrder.is_paid() || this.invoicing) {
                return false;
            }

            if (this.currentOrder.has_not_valid_rounding()) {
                var line = this.currentOrder.has_not_valid_rounding();
                this.showPopup('ErrorPopup', {
                    title: this.env._t('Incorrect rounding'),
                    body: this.env._t(
                        'You have to round your payments lines.' + line.amount + ' is not rounded.'
                    ),
                });
                return false;
            }

            // The exact amount must be paid if there is no cash payment method defined.
            if (
                Math.abs(
                    this.currentOrder.get_total_with_tax() - this.currentOrder.get_total_paid()  + this.currentOrder.get_rounding_applied()
                ) > 0.00001
            ) {
                var cash = false;
                for (var i = 0; i < this.env.pos.payment_methods.length; i++) {
                    cash = cash || this.env.pos.payment_methods[i].is_cash_count;
                }
                if (!cash) {
                    this.showPopup('ErrorPopup', {
                        title: this.env._t('Cannot return change without a cash payment method'),
                        body: this.env._t(
                            'There is no cash payment method available in this point of sale to handle the change.\n\n Please pay the exact amount or add a cash payment method in the point of sale configuration'
                        ),
                    });
                    return false;
                }
            }

            // if the change is too large, it's probably an input error, make the user confirm.
            if (
                !isForceValidate &&
                this.currentOrder.get_total_with_tax() > 0 &&
                this.currentOrder.get_total_with_tax() * 1000 < this.currentOrder.get_total_paid()
            ) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please Confirm Large Amount'),
                    body:
                        this.env._t('Are you sure that the customer wants to  pay') +
                        ' ' +
                        this.env.pos.format_currency(this.currentOrder.get_total_paid()) +
                        ' ' +
                        this.env._t('for an order of') +
                        ' ' +
                        this.env.pos.format_currency(this.currentOrder.get_total_with_tax()) +
                        ' ' +
                        this.env._t('? Clicking "Confirm" will validate the payment.'),
                }).then(({ confirmed }) => {
                    if (confirmed) this.validateOrder(true);
                });
                return false;
            }

            if (!this.currentOrder._isValidEmptyOrder()) return false;

            return true;
        }
        async _postPushOrderResolve(order, order_server_ids) {
            return true;
        }
        async _sendPaymentRequest({ detail: line }) {
            // Other payment lines can not be reversed anymore
            this.paymentLines.forEach(function (line) {
                line.can_be_reversed = false;
            });

            const payment_terminal = line.payment_method.payment_terminal;
            line.set_payment_status('waiting');

            const isPaymentSuccessful = await payment_terminal.send_payment_request(line.cid);
            if (isPaymentSuccessful) {
                line.set_payment_status('done');
                line.can_be_reversed = payment_terminal.supports_reversals;
            } else {
                line.set_payment_status('retry');
            }
        }
        async _sendPaymentCancel({ detail: line }) {
            const payment_terminal = line.payment_method.payment_terminal;
            line.set_payment_status('waitingCancel');
            const isCancelSuccessful = await payment_terminal.send_payment_cancel(this.currentOrder, line.cid);
            if (isCancelSuccessful) {
                line.set_payment_status('retry');
            } else {
                line.set_payment_status('waitingCard');
            }
        }
        async _sendPaymentReverse({ detail: line }) {
            const payment_terminal = line.payment_method.payment_terminal;
            line.set_payment_status('reversing');

            const isReversalSuccessful = await payment_terminal.send_payment_reversal(line.cid);
            if (isReversalSuccessful) {
                line.set_amount(0);
                line.set_payment_status('reversed');
            } else {
                line.can_be_reversed = false;
                line.set_payment_status('done');
            }
        }
        async _sendForceDone({ detail: line }) {
            line.set_payment_status('done');
        }
    }
    PaymentScreen.template = 'PaymentScreen';

    Registries.Component.add(PaymentScreen);

    return PaymentScreen;
});
