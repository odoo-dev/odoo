import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { useState, onMounted, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";

patch(ReceiptScreen.prototype, {
    setup() {
        super.setup(...arguments);
        this.eta_result = useState({
            'state': 'ignore',
            'error': {},
            'loading': false
        });
        this.orm = useService("orm");
        onMounted(() => this.pos.bus.trigger('order_synchronized', this.checkETAStatus, this));
        onWillStart(this.checkETAStatus);
    },
    async checkETAStatus() {
        const order = this.currentOrder;
        const countryCode = order.country_code;
        if (countryCode === 'EG' && !order.to_invoice && this.eta_result.state !== 'sent') {
            const orderId = this.pos.validated_orders_name_server_id_map[order.name]
            try {
                if (orderId) {
                    let eta_result = await this.orm.call({
                        model: 'pos.order',
                        method: 'search_read',
                        domain: [['id', '=', orderId]],
                        fields: ['l10n_eg_pos_eta_state', 'l10n_eg_pos_eta_error']
                    });
                    return this._postProcessETAResults(eta_result[0])
                }
            } catch (e) {
                this.eta_result.error = {'message': _t("Uncaught Exception: ") + e.message}
            }
            this.eta_result.state = 'pending'
        }
    },
    async submitToETA() {
        if (this.eta_result.loading || this.eta_result.state !== 'pending') return
        this.eta_result.loading = true;
        this.eta_result.error = {};
        const orderId = this.pos.validated_orders_name_server_id_map[this.currentOrder.name];
        try {
            if (orderId) {
                let eta_results = await this.orm.call({
                    model: 'pos.order',
                    method: 'l10n_eg_pos_eta_process_receipts_frontend',
                    args: [orderId]
                });
                if (eta_results.error) {
                    this.eta_result.error = {'message': eta_results.error}
                } else {
                    this._postProcessETAResults(eta_results[orderId]);
                    this.pos.bus.trigger('receipt_submitted', this.pos, this.currentOrder);
                }
            } else {
                await this.pos.push_orders(this.currentOrder, {show_error: true});
            }
        } catch (e) {
            this.eta_result.error = {'message': _t("Uncaught Exception: ") + e.message}
        }
        this.eta_result.loading = false;
    },

    _postProcessETAResults(results) {
        this.eta_result.state = results.l10n_eg_pos_eta_state
        try {
            this.eta_result.error = JSON.parse(results.l10n_eg_pos_eta_error)
        } catch (e) {
            this.eta_result.error = {
                'message': results.l10n_eg_pos_eta_error || _t('Unknown Error: Could not parse error message')
            }
        }
    },

    get showError() {
        return this.eta_result.error && this.eta_result.state !== 'sent'
    }
})
