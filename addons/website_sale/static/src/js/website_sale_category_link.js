/** @odoo-module **/

import * as publicWidget from 'web.public.widget'

publicWidget.registry.ProductCategoriesLinks = publicWidget.Widget.extend({
    selector: '.o_wsale_products_page',
    events: {
        'click [data-link-href]': '_openLink',
    },

    _openLink: function (ev) {
        this.el.querySelector('.o_wsale_products_grid_table_wrapper').classList.add('opacity-50');
        window.location.href = ev.currentTarget.getAttribute('data-link-href');
    },
});
