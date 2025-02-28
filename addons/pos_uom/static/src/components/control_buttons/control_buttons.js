import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { makeAwaitable } from "@point_of_sale/app/store/make_awaitable_dialog";
import { NumberPopup } from "@point_of_sale/app/utils/input_popups/number_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

patch(ControlButtons.prototype, {
    setup(){
        super.setup();
        this.pos = usePos();
        this.dialog = useService("dialog");
    },

    get hasSelectedOrderLine(){
        const order = this.pos.get_order();
        return order && order.get_selected_orderline() ? true : false;
    },

    async onClickAddQuantity(){
        const line = this.pos.get_order().get_selected_orderline();
        const primary_uom = line.product_id.uom_id;
        const second_uom = line.product_id.pos_second_uom;

        if(!second_uom){
            this.pos.dialog.add(AlertDialog, {
                title: _t("Error"),
                body: _t("Second UoM is not configured"),
            });
            return;
        }

        const quantity = await makeAwaitable(this.dialog, NumberPopup, {
            title: _t(`Enter Quantity in ${second_uom.name}`),
            getPayload: (value) => parseFloat(value),
        });

        if(quantity){
            if(quantity <= 0){
                this.pos.dialog.add(AlertDialog, {
                    title: _t("Error"),
                    body: _t("Quantity cannot be negative"),
                });
                return;
            }
            const conversionFactor = second_uom.factor / primary_uom.factor;
            const primaryUOMQty = quantity / conversionFactor;
            line.set_quantity(primaryUOMQty);
        }
    }
});
