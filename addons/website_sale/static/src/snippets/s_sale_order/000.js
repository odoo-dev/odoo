/** @odoo-module **/

import { renderToElement } from "@web/core/utils/render";
import publicWidget from "@web/legacy/js/public/public_widget";
import { rpc } from "@web/core/network/rpc";

publicWidget.registry.get_product_tab = publicWidget.Widget.extend({
    selector: '.s_sale_order_items',

    async willStart() {
        const sale_orders = await rpc('/get_sale_order_snippet', {});
        if (sale_orders) {
            this.$target
                .empty()
                .append(renderToElement('website_sale.sale_order_data', { sale_orders }))
        }
    },

    start() {
        this._super(...arguments);
        const showConfirmed = this.el.dataset.showConfirmed === 'true';
        this._applyFilter(showConfirmed);
    },

    _applyFilter(showConfirmed) {
        const cards = this.el.querySelectorAll('.card');
        cards.forEach(card => {
            const state = card.dataset.orderState.toLowerCase();
            card.closest('.col-12').style.display =
                showConfirmed
                    ? (state === 'sale' ? '' : 'none')
                    : '';
        });
    },
});
