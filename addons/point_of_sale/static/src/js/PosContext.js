odoo.define('point_of_sale.PosContext', function (require) {
    'use strict';
    const { reactive } = owl;

    // Create global context objects
    const context = reactive({
        orderManagement: { searchString: "", selectedOrder: null },
        chrome: { showOrderSelector: true },
    });

    return context;
});
