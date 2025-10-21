/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";
import { serializeDateTime } from "@web/core/l10n/dates";
import { handleRPCError } from "@point_of_sale/app/errors/error_handlers";

patch(PaymentScreen.prototype, {
    get nextCustomScreen() {
        return this.pos.config.iface_print_auto ? "ProductScreen" : "ReceiptScreen";
    },
    async _finalizeValidation() {
        if (this.currentOrder.is_paid_with_cash() || this.currentOrder.get_change()) {
            this.hardwareProxy.openCashbox();
        }
        this.currentOrder.date_order = serializeDateTime(luxon.DateTime.now());
        for (const line of this.paymentLines) {
            if (!line.amount === 0) {
                this.currentOrder.remove_paymentline(line);
            }
        }
        this.pos.addPendingOrder([this.currentOrder.id]);
        this.currentOrder.state = "paid";
        this.env.services.ui.block();
        let syncOrderResult;
        try {
            syncOrderResult = await this.pos.syncAllOrders({ throw: true });
            if (!syncOrderResult) {
                return;
            }
            if (this.shouldDownloadInvoice() && this.currentOrder.is_to_invoice()) {
                if (this.currentOrder.raw.account_move) {
                    await this.invoiceService.downloadPdf(this.currentOrder.raw.account_move);
                } else {
                    throw {
                        code: 401,
                        message: "Backend Invoice",
                        data: { order: this.currentOrder },
                    };
                }
            }
        } catch (error) {
            if (error instanceof ConnectionLostError) {
                if(this.pos.config.iface_print_auto){
                    this.pos.printReceipt(this.currentOrder);
                    this.currentOrder.set_screen_data({ name: "" });
                    this.currentOrder.uiState.locked = true;
                    this.selectNextOrder();
                }                
                this.pos.showScreen(this.nextCustomScreen);
                Promise.reject(error);
            } else if (error instanceof RPCError) {
                this.currentOrder.state = "draft";
                handleRPCError(error, this.dialog);
            } else {
                throw error;
            }
            return error;
        } finally {
            this.env.services.ui.unblock();
        }
        const postPushOrders = syncOrderResult.filter((order) => order.wait_for_push_order());
        if (postPushOrders.length > 0) {
            await this.postPushOrderResolve(postPushOrders.map((order) => order.id));
        }        
        await this.afterOrderValidation(!!syncOrderResult && syncOrderResult.length > 0);
    }
});
