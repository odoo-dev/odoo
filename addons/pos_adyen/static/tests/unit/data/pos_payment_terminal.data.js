import { patch } from "@web/core/utils/patch";
import { PosPaymentTerminal } from "@point_of_sale/../tests/unit/data/pos_payment_terminal.data";

patch(PosPaymentTerminal.prototype, {
    _load_pos_data_fields() {
        return [...super._load_pos_data_fields(), "adyen_terminal_identifier"];
    },
});
