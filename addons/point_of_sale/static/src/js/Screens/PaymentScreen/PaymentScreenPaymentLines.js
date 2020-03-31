odoo.define('point_of_sale.PaymentScreenPaymentLines', function(require) {
    'use strict';

    const { PosComponent, addComponents } = require('point_of_sale.PosComponent');
    const { PaymentScreen } = require('point_of_sale.PaymentScreen');
    const Registry = require('point_of_sale.ComponentsRegistry');

    class PaymentScreenPaymentLines extends PosComponent {
        static template = 'PaymentScreenPaymentLines';
        formatLineAmount(paymentline) {
            return this.env.pos.format_currency_no_symbol(paymentline.get_amount());
        }
        get changeText() {
            return this.env.pos.format_currency(this.currentOrder.get_change());
        }
        get totalDueText() {
            return this.env.pos.format_currency(
                this.currentOrder.get_total_with_tax() + this.currentOrder.get_rounding_applied()
            );
        }
        get remainingText() {
            return this.env.pos.format_currency(
                this.currentOrder.get_due() > 0 ? this.currentOrder.get_due() : 0
            );
        }
        get currentOrder() {
            return this.env.pos.get_order();
        }
    }

    addComponents(PaymentScreen, [PaymentScreenPaymentLines]);
    Registry.add('PaymentScreenPaymentLines', PaymentScreenPaymentLines);

    return { PaymentScreenPaymentLines };
});
