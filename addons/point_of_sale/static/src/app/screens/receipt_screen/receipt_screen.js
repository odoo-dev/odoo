import { _t } from "@web/core/l10n/translation";
import { useErrorHandlers, useTrackedAsync } from "@point_of_sale/app/hooks/hooks";
import { registry } from "@web/core/registry";
import { useState, Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { POSOrderReceipt } from "@point_of_sale/backend/pos_order_receipt/pos_order_receipt";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { isValidEmail } from "@point_of_sale/utils";
import { useRouterParamsChecker } from "@point_of_sale/app/hooks/pos_router_hook";

export class ReceiptScreen extends Component {
    static template = "point_of_sale.ReceiptScreen";
    static components = { POSOrderReceipt };
    static props = {
        orderUuid: { type: String },
    };

    setup() {
        super.setup();
        this.pos = usePos();
        useRouterParamsChecker();
        useErrorHandlers();
        this.ui = useService("ui");
        this.renderer = useService("renderer");
        this.notification = useService("notification");
        this.dialog = useService("dialog");
        const partner = this.currentOrder.getPartner();
        const email = partner?.invoice_emails || partner?.email || "";
        this.state = useState({
            email: email,
            phone: partner?.phone || "",
        });
        this.sendReceipt = useTrackedAsync(this._sendReceiptToCustomer.bind(this));
        this.doFullPrint = useTrackedAsync(() => this.pos.printReceipt());
        this.doBasicPrint = useTrackedAsync(() => this.pos.printReceipt({ basic: true }));
    }
    actionSendReceiptOnEmail() {
        this.sendReceipt.call({
            action: "action_send_receipt",
            destination: this.state.email,
            name: "Email",
        });
    }
    get currentOrder() {
        return this.pos.models["pos.order"].getBy("uuid", this.props.orderUuid);
    }
    get orderAmountPlusTip() {
        const order = this.currentOrder;
        const orderTotalAmount = order.getTotalWithTax();
        const tip_product_id = this.pos.config.tip_product_id?.id;
        const tipLine = order
            .getOrderlines()
            .find((line) => tip_product_id && line.product_id.id === tip_product_id);
        const tipAmount = tipLine ? tipLine.allPrices.priceWithTax : 0;
        const orderAmountStr = this.env.utils.formatCurrency(orderTotalAmount - tipAmount);
        if (!tipAmount) {
            return orderAmountStr;
        }
        const tipAmountStr = this.env.utils.formatCurrency(tipAmount);
        return `${orderAmountStr} + ${tipAmountStr} tip`;
    }
    get ticketScreen() {
        return { name: "TicketScreen" };
    }
    get isValidEmail() {
        return isValidEmail(this.state.email);
    }
    get isValidPhone() {
        return this.state.phone && /^\+?[()\d\s-.]{8,18}$/.test(this.state.phone);
    }
    get receiptData() {
        const order = this.currentOrder;
        const config = order.config;
        const partner = order.partner_id;
        const data = {
            headerData: {
                logo: config.receiptLogoUrl,
                pos_reference: order.pos_reference,
                date_order: order.date_order && order.formatDateOrTime("date_order"),
                cashier: order?.getCashierName(),
                preset_id: order.preset_id,
                preset_name: order.preset_id?.name,
                presetDateTime: order.presetDateTime,
                preset_identifier: order.preset_id?.identification,
                tracking_number: order.tracking_number,
                anyLineHaveTaxLabel: order.lines?.some((line) => line.taxGroupLabels),
                // config fields
                receipt_header: config.receipt_header,
                is_restaurant: config.is_restaurant,
                _IS_VAT: config._IS_VAT,
                displayTrackingNumber: config.displayTrackingNumber,
                displayBigTrackingNumber: config.displayBigTrackingNumber,
            },
            receipt_footer: config.receipt_footer,
            order: order,
            taxTotals: order.taxTotals,
            basic_receipt: false,
        };
        if (partner) {
            data["headerData"]["partner"] = {
                name: partner.name,
                parent_name: partner.parent_name,
                pos_contact_address: partner.pos_contact_address,
                vat: partner.vat,
                partnerAddress: partner.pos_contact_address
                    .split("\n")
                    .filter((line) => line.trim() !== "")
                    .join(", "),
            };
        }
        return data;
    }
    showPhoneInput() {
        return false;
    }

    generateTicketImage = async (basicReceipt = false) =>
        await this.renderer.toJpeg(
            POSOrderReceipt,
            {
                order: this.currentOrder,
                basic_receipt: basicReceipt,
            },
            { addClass: "pos-receipt-print p-3" }
        );
    async _sendReceiptToCustomer({ action, destination }) {
        const order = this.currentOrder;
        if (typeof order.id !== "number") {
            this.dialog.add(ConfirmationDialog, {
                title: _t("Unsynced order"),
                body: _t(
                    "This order is not yet synced to server. Make sure it is synced then try again."
                ),
            });
            return Promise.reject();
        }
        const fullTicketImage = await this.generateTicketImage();
        const basicTicketImage = this.pos.config.basic_receipt
            ? await this.generateTicketImage(true)
            : null;
        await this.pos.data.call("pos.order", action, [
            [order.id],
            destination,
            fullTicketImage,
            basicTicketImage,
        ]);
    }
}

registry.category("pos_pages").add("ReceiptScreen", {
    name: "ReceiptScreen",
    component: ReceiptScreen,
    route: `/pos/ui/${odoo.pos_config_id}/receipt/{string:orderUuid}`,
    params: {
        orderUuid: true,
        orderFinalized: true,
    },
});
