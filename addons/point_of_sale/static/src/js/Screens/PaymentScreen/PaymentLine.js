odoo.define('point_of_sale.PaymentLine', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PaymentLine extends PosComponent {
        get _line() {
            return this.props.line;
        }
        formatLineAmount(line) {
            return this.env.pos.format_currency_no_symbol(line.get_amount());
        }
        selectedLineClass(line) {
            return { 'payment-terminal': line.get_payment_status() };
        }
        unselectedLineClass(line) {
            return {};
        }
    }
    PaymentLine.template = 'PaymentLine';

    Registries.Component.add(PaymentLine);

    return PaymentLine;
});
