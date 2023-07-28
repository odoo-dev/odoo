/** @odoo-module **/

import PublicWidget from '@web/legacy/js/public/public_widget';
import { patch } from '@web/legacy/js/core/utils';
import { _t } from "@web/core/l10n/translation";

patch(PublicWidget.registry.websiteSaleDelivery, 'addons/website_sale_loyalty_delivery/statis/src/js/website_sale_loyalty_delivery.js', {
    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
     _handleCarrierUpdateResult: async function (carrierInput) {
        await this._super.apply(this, arguments);
        if (this.result.new_amount_order_discounted) {
            // Update discount of the order
            $('#order_discounted').html(this.result.new_amount_order_discounted);
        }
    },
    /**
     * @override
     */
    _handleCarrierUpdateResultBadge: function (result) {
        this._super.apply(this, arguments);
        if (result.new_amount_order_discounted) {
            // We are in freeshipping, so every carrier is Free but we don't
            // want to replace error message by 'Free'
            $('#delivery_carrier .badge:not(.o_wsale_delivery_carrier_error)').text(_t('Free'));
        }
    },
});
