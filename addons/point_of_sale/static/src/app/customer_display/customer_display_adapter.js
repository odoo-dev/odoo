import { formatCurrency } from "@point_of_sale/app/models/utils/currency";
import { PosWebrtcService } from "../utils/webRTC/pos_webrtc";
import { uuidv4 } from "@point_of_sale/utils";

/**
 * This module provides functions to format order and order line data for customer display.
 * The goal is to format data in a way that avoids loading all models in the customer display.
 */

export class CustomerDisplayPosAdapter {
    constructor(pos) {
        this.pos = pos;
        let deviceUuid = localStorage.getItem("device_uuid");
        if (!deviceUuid) {
            deviceUuid = uuidv4();
            localStorage.setItem("device_uuid", deviceUuid);
        }
        this.webrtc = new PosWebrtcService(
            pos.env,
            `CUSTOMER-DISPLAY-${deviceUuid}`,
            odoo.access_token,
            this.pos.config.id
        );
        pos.webrtc = this.webrtc;
    }

    dispatch() {
        this.webrtc.send(this.data);
    }

    displayScreenSaver() {
        this.data.displayScreenSaver = true;
    }

    setExtraData(data) {
        if (data) {
            Object.assign(this.data, data);
        }
    }

    formatOrderData(order) {
        this.currency = order.currency;
        this.data = {
            finalized: order.finalized,
            general_customer_note: order.general_customer_note,
            amount: order.currencyDisplayPriceIncl,
            subtotal:
                order.config_id.iface_tax_included !== "total" &&
                order.prices.taxDetails.has_tax_groups &&
                order.currencyDisplayPriceExcl,
            amountTaxes: order.prices.taxDetails.has_tax_groups && order.currencyAmountTaxes,
            change: order.change && formatCurrency(order.change, order.currency),
            paymentLines: order.payment_ids.map((pl) => this.getPaymentData(pl)),
            lines: order.lines.map((l) => this.getOrderlineData(l)),
            qrPaymentData: this.getQrPaymentData(order),
            displayScreenSaver: false,
        };
    }

    getOrderlineData(line) {
        return {
            productId: line.product_id.id,
            taxGroupLabels: line.taxGroupLabels,
            discount: line.getDiscountStr(),
            customerNote: line.getCustomerNote() || "",
            internalNote: line.getNote() || "",
            productName: line.getFullProductName(),
            price: line.currencyDisplayPrice,
            qty: line.getQuantityStr().qtyStr,
            unit: line.product_id.uom_id ? line.product_id.uom_id.name : "",
            unitPrice: line.currencyDisplayPriceUnit,
            comboParent: line.combo_parent_id?.getFullProductName?.() || "",
            price_without_discount: formatCurrency(line.displayPriceNoDiscount, line.currency),
            isSelected: line.isSelected(),
        };
    }

    getPaymentData(payment) {
        return {
            name: payment.payment_method_id.name,
            amount: formatCurrency(payment.amount, this.currency),
        };
    }

    getQrPaymentData(order) {
        const qrPaymentData = order.getSelectedPaymentline()?.getQrPopupProps(true);
        return qrPaymentData
            ? {
                  ...qrPaymentData,
                  amount: formatCurrency(qrPaymentData.amount, this.currency),
              }
            : null;
    }
}
