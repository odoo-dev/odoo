odoo.define('point_of_sale.IndependentToOrderScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');

    class IndependentToOrderScreen extends PosComponent {
        /**
         * Alias the forceTriggerSelectedOrder method as it also
         * means 'closing' this screen.
         */
        close() {
            this.forceTriggerSelectedOrder();
        }
        forceTriggerSelectedOrder() {
            const order = this.env.pos.get_order();
            const { name: screenName } = order.get_screen_data();
            this.showScreen(screenName);
        }
    }

    return IndependentToOrderScreen;
});
