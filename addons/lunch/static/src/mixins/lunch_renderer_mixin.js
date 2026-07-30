import { _t } from "@web/core/l10n/translation";
import { useBus, useService } from "@web/core/utils/hooks";
import { useSearchModel } from "@web/search/search_model";

export const LunchRendererMixin = (T) => class LunchRendererMixin extends T {
    setup() {
        super.setup(...arguments);

        this.searchModel = useSearchModel();
        this.action = useService("action");
        useBus(this.env.bus, 'lunch_open_order', (ev) => this.openOrderLine(ev.detail.productId));
    }

    openOrderLine(productId, orderId) {
        let context = {};

        if (this.searchModel.lunchState.userId) {
            context['default_user_id'] = this.searchModel.lunchState.userId;
        }
        if (this.searchModel.lunchState.date) {
            context['default_date'] = this.searchModel.lunchState.date;
        }
        if (this.searchModel.lunchState.locationId) {
            context['default_lunch_location_id'] = this.searchModel.lunchState.locationId;
        }

        let action = {
            res_model: 'lunch.order',
            name: _t('Configure Your Order'),
            type: 'ir.actions.act_window',
            views: [[false, 'form']],
            target: 'new',
            context: {
                ...context,
                default_product_id: productId,
            },
        };

        if (orderId) {
            action['res_id'] = orderId;
        }

        this.action.doAction(action, {
            onClose: () => this.env.bus.trigger('lunch_update_dashboard')
        });
    }
};
