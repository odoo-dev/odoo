import { patch } from "@web/core/utils/patch";
import { SelectLotPopup } from "@point_of_sale/app/components/popups/select_lot_popup/select_lot_popup";

patch(SelectLotPopup.prototype, {
    _makeOnSelect(option) {
        const payload = super._makeOnSelect(option);
        if (option?.expiration_date) {
            payload.expiration_date = option.expiration_date;
        }
        return payload;
    },

    onSelect(lot) {
        super.onSelect(lot);
        // if the new lot is being created - not need to add expiration_date
        if (lot?.currentInput) {
            return;
        }
        const updateItem = this.state.values && this.state.values[this.state.values.length - 1];
        if (updateItem && updateItem.text === lot.label) {
            updateItem.expiration_date = lot.expiration_date;
        }
    },
});
