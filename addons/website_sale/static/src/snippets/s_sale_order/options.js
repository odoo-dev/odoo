/** @odoo-module **/

import options from '@web_editor/js/editor/snippets.options';

options.registry.SaleOrderOption = options.Class.extend({

    _computeWidgetState(methodName, params) {
        if (methodName === 'toggleOption' && params.optionName === 'confirm_orders') {
            return this.$target[0].dataset.showConfirmed === 'true';
        }
        return this._super(...arguments);
    },

    toggleOption(previewMode, widgetValue, params) {
        if (params.optionName === 'confirm_orders') {
            this.$target[0].dataset.showConfirmed = widgetValue;
            this._applyFilter(widgetValue);
        }
    },

    _applyFilter(showConfirmed) {
        const cards = this.$target[0].querySelectorAll('.card');
        cards.forEach(card => {
            const state = card.dataset.orderState.toLowerCase();
            card.closest('.col-12').style.display =
                showConfirmed
                    ? (state === 'sale' ? '' : 'none')
                    : '';
        });
    },
});
