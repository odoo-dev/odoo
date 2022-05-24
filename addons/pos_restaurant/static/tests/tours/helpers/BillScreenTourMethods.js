odoo.define('pos_restaurant.tour.BillScreenTourMethods', function (require) {
    'use strict';

    const { createTourMethods } = require('point_of_sale.tour.utils');

    class Do {
        clickOk() {
            return [
                {
                    content: `go back`,
                    trigger: `.receipt-screen .button.next`,
                },
            ];
        }
    }

    class Check {
        isShown() {
            return [
                {
                    content: 'Bill screen is shown',
                    trigger: '.receipt-screen h1:contains("Bill Printing")',
                    run: () => {},
                },
            ];
        }
    }

    return createTourMethods('BillScreen', Do, Check);
});
