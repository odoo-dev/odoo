odoo.define('pos_mercury.PaymentLine', function (require) {
    'use strict';

    const PaymentLine = require('point_of_sale.PaymentLine');
    const Registries = require('point_of_sale.Registries');

    const PosMercuryPaymentLines = (PaymentLine) =>
        class extends PaymentLine {
            /**
             * @override
             */
            selectedLineClass(line) {
                return Object.assign({}, super.selectedLineClass(line), {
                    o_pos_mercury_swipe_pending: line.mercury_swipe_pending,
                });
            }
            /**
             * @override
             */
            unselectedLineClass(line) {
                return Object.assign({}, super.unselectedLineClass(line), {
                    o_pos_mercury_swipe_pending: line.mercury_swipe_pending,
                });
            }
        };

    Registries.Component.extend(PaymentLine, PosMercuryPaymentLines);

    return PaymentLine;
});
