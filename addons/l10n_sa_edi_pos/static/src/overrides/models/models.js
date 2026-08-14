/** @odoo-module */

import { Order } from "@point_of_sale/app/store/models";
import { patch } from "@web/core/utils/patch";

patch(Order.prototype, {
    setup(_defaultObj, options) {
        super.setup(...arguments);
        if (this.isInvoiceMandatoryForSA) {
            this.to_invoice = true;
        }
    },
    is_to_invoice() {
        if (this.pos.isSACompany) {
            // 17.0: pos_settle_due flags the order as a settlement after set_partner() has run,
            // so the value computed in setup() cannot be trusted, recompute it here.
            return this.isInvoiceMandatoryForSA;
        }
        return super.is_to_invoice(...arguments);
    },
    set_to_invoice(to_invoice) {
        if (this.isInvoiceMandatoryForSA) {
            this.assert_editable();
            this.to_invoice = true;
        } else {
            super.set_to_invoice(...arguments);
        }
    },

    set_partner(partner) {
        /*
        The settlement dialog sets is_settling_account = true after creating the order
        So making it default to false here as this is called after is_settling_account is set
        is_settling_account is only applicable if enterprise:pos_settle_due module is installed
        */
        super.set_partner(partner);
        if (this.is_settling_account) {
            this.set_to_invoice(false);
        }
    },

    export_as_JSON() {
        const json = super.export_as_JSON(...arguments);
        if (this.pos.isSACompany) {
            // 17.0 serializes the raw to_invoice attribute, which was forced to true before the
            // order was flagged as a settlement. Realign it with is_to_invoice().
            json.to_invoice = this.is_to_invoice();
        }
        return json;
    },

    get isInvoiceMandatoryForSA() {
        // Zatca enforces invoice, but for settlement due, invoices are not needed
        // Only applicable if enterprise:pos_settle_due module is installed
        return this.pos.isSACompany && !this.is_settling_account;
    },

    init_from_JSON(json) {
        super.init_from_JSON(...arguments);
        // 17.0 only: needed to reprint the receipt of a past order with its Phase 2 QR code.
        this.l10n_sa_invoice_qr_code_str = json.l10n_sa_invoice_qr_code_str;
        this.l10n_sa_invoice_edi_state = json.l10n_sa_invoice_edi_state;
    },
});
