import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { roundCurrency } from "@point_of_sale/app/models/utils/currency";
import { patch } from "@web/core/utils/patch";

patch(PosOrder.prototype, {
    /**
     * Fiscal system handling the POS orders of the company ('tbai', 'sii', 'verifactu'),
     * or false when no EDI is active. Computed by `res.company._l10n_es_pos_get_fiscal_mode`.
     */
    get l10nEsPosFiscalMode() {
        return this.config._l10n_es_pos_fiscal_mode || false;
    },

    /**
     * Mirror of `pos.order._l10n_es_pos_get_invoice_name`. The values it relies on are only
     * known once the order is synced: `waitForPushOrder` makes the receipt wait for it.
     */
    get l10nEsPosInvoiceName() {
        // `to_invoice` stands for `is_singly_invoiced`: an order invoiced from the POS, or later
        // on from the backend, has its own invoice in `account_move`, never a session closing entry.
        if (this.to_invoice) {
            return this.account_move?.name || "";
        }
        if (this.sequence_number) {
            return `${this.config_id.id}/${String(this.sequence_number).padStart(6, "0")}`;
        }
        return "";
    },

    get l10nEsPosIsSimplifiedInvoice() {
        return Boolean(this.sequence_number) && !this.to_invoice;
    },

    waitForPushOrder() {
        // The fiscal number (and the QR code of TicketBAI and Veri*Factu) is set by the
        // server when the order is paid.
        return this.l10nEsPosFiscalMode ? true : super.waitForPushOrder(...arguments);
    },

    /**
     * Whether the order can be issued as a simplified invoice: its amount, taxes included,
     * must not exceed the limit of the company. The amount equal to the limit is allowed.
     * Mirrors `pos.order._l10n_es_pos_check_simplified_invoice_limit` in Python.
     */
    l10nEsPosCanBeSimplifiedInvoice() {
        const total = roundCurrency(this.priceIncl, this.currency);
        return total <= this.company.l10n_es_simplified_invoice_limit;
    },
});