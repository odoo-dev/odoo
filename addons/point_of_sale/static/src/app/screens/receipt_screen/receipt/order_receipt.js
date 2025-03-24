import { Component, onWillStart } from "@odoo/owl";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { ReceiptHeader } from "@point_of_sale/app/screens/receipt_screen/receipt/receipt_header/receipt_header";
import { OrderDisplay } from "@point_of_sale/app/components/order_display/order_display";
import { qrCodeSrc } from "@point_of_sale/utils";
import { getTemplate } from "@web/core/templates";
// import { _t } from "@web/core/l10n/translation";
import { formatCurrency } from "@web/core/currency";

import { _t_pos } from "@point_of_sale/app/services/pos_translation";
function _t(term, ...vals) {
    // vals.push("gu_IN");
    return _t_pos(term, ...vals);
}
// t-translation-context="gu_IN"

export class OrderReceipt extends Component {
    static template = "point_of_sale.OrderReceipt";
    static components = {
        Orderline,
        OrderDisplay,
        ReceiptHeader,
    };
    static props = {
        order: Object,
        basic_receipt: { type: Boolean, optional: true },
    };
    static defaultProps = {
        basic_receipt: false,
    };

    setup() {
        onWillStart(() => {
            const currentOrder = this.props.order;
            const rLayout = getTemplate("point_of_sale.OrderReceipt");
            const posReceipt = rLayout.querySelector(".pos-receipt");
            if (currentOrder.partner_id?.lang) {
                posReceipt.setAttribute("t-translation-context", currentOrder.partner_id.lang);
            } else {
                posReceipt.removeAttribute("t-translation-context");
            }
            console.log(
                "posReceipt.getAttribute == ",
                posReceipt.getAttribute("t-translation-context")
            );
        });
    }

    get header() {
        return {
            company: this.order.company,
            cashier: _t("Served by %s", this.order?.getCashierName()),
            header: this.order.config.receipt_header,
        };
    }

    get order() {
        return this.props.order;
    }

    get customerLang() {
        return this.order.partner_id.lang;
    }

    get qrCode() {
        const baseUrl = this.order.session._base_url;
        return (
            this.order.company.point_of_sale_use_ticket_qr_code &&
            this.order.finalized &&
            qrCodeSrc(`${baseUrl}/pos/ticket?order_uuid=${this.order.uuid}`)
        );
    }

    get paymentLines() {
        return this.order.payment_ids.filter((p) => !p.is_change);
    }

    formatCurrency(amount) {
        return formatCurrency(amount, this.order.currency.id);
    }

    doesAnyOrderlineHaveTaxLabel() {
        return this.order.lines?.some((line) => line.taxGroupLabels);
    }

    getPortalURL() {
        return `${this.order.session._base_url}/pos/ticket`;
    }
}
